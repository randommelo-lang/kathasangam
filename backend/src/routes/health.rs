use axum::{extract::State, http::StatusCode, Json};
use sqlx::PgPool;
use serde::Serialize;
use std::time::Instant;
use crate::db::AuthUser;
use crate::errors::AppError;

/// Minimal, unauthenticated liveness payload.
///
/// SB-14: this endpoint was unauthenticated and returned the crate version, database
/// latency, exact connection-pool occupancy and the storage backend mode. Pool figures
/// are directly useful for calibrating a connection-exhaustion attack, and the version
/// enables targeted CVE matching. Render only needs a status code to keep the service
/// alive, so the public response is now reduced to that.
#[derive(Serialize)]
pub struct LivenessStatus {
    pub status: &'static str,
}

/// Full diagnostic detail. Staff-only.
#[derive(Serialize)]
pub struct HealthStatus {
    pub status: String,
    pub version: &'static str,
    pub timestamp: String,
    pub database: DatabaseHealth,
    pub search: SearchHealth,
    pub storage: StorageHealth,
}

#[derive(Serialize)]
pub struct DatabaseHealth {
    pub status: String,
    pub latency_ms: u128,
    pub pool: DatabasePoolStats,
}

#[derive(Serialize)]
pub struct DatabasePoolStats {
    pub total_connections: u32,
    pub idle_connections: usize,
}

#[derive(Serialize)]
pub struct SearchHealth {
    pub status: String,
    pub latency_ms: u128,
}

#[derive(Serialize)]
pub struct StorageHealth {
    pub status: String,
    pub mode: String,
    pub latency_ms: u128,
}

/// GET /api/health — unauthenticated liveness probe.
/// Returns 200 when the service can reach its database, 503 otherwise.
pub async fn health_check(State(pool): State<PgPool>) -> Result<Json<LivenessStatus>, (StatusCode, Json<LivenessStatus>)> {
    let healthy = sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .is_ok();

    if healthy {
        Ok(Json(LivenessStatus { status: "healthy" }))
    } else {
        Err((StatusCode::SERVICE_UNAVAILABLE, Json(LivenessStatus { status: "unhealthy" })))
    }
}

/// GET /api/health/details — full diagnostics, restricted to staff.
/// SB-14: this replaces the detail that used to be served to anonymous callers.
pub async fn health_details(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<HealthStatus>, AppError> {
    let role: Option<(String,)> = sqlx::query_as("SELECT role::text FROM profiles WHERE id = $1")
        .bind(auth.user_id)
        .fetch_optional(&pool)
        .await?;

    match role {
        Some((r,)) if r == "admin" || r == "moderator" => {}
        _ => {
            return Err(AppError::forbidden(
                "You do not have permission to view service diagnostics.",
            ))
        }
    }

    Ok(Json(collect_health_status(&pool).await))
}

/// Shared by the staff-only details endpoint. Errors are logged, never returned.
pub async fn collect_health_status(pool: &PgPool) -> HealthStatus {
    let mut core_healthy = true;

    // 1. Check Database
    let db_start = Instant::now();
    let db_res = sqlx::query("SELECT 1").execute(pool).await;
    let db_latency = db_start.elapsed().as_millis();
    let db_status = match db_res {
        Ok(_) => "up".to_string(),
        Err(_) => {
            core_healthy = false;
            "down".to_string()
        }
    };

    // Search runs in PostgreSQL, so its health follows the database check above.

    // 2. Check Storage (Supabase Storage or Local Uploads)
    let storage_start = Instant::now();
    let supabase_url = std::env::var("SUPABASE_URL").unwrap_or_default();
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").unwrap_or_default();

    let (storage_status, storage_mode) = if !supabase_url.is_empty() && !service_role_key.is_empty() {
        // Query Supabase Storage Health Endpoint
        let status = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .build()
        {
            Ok(client) => {
                let health_url = format!("{}/storage/v1/health", supabase_url);
                match client
                    .get(&health_url)
                    .header("apikey", &service_role_key)
                    .header("Authorization", format!("Bearer {}", service_role_key))
                    .send()
                    .await
                {
                    Ok(resp) if resp.status().is_success() => "up".to_string(),
                    _ => {
                        core_healthy = false;
                        "down".to_string()
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to build storage health client: {}", e);
                core_healthy = false;
                "down".to_string()
            }
        };
        (status, "supabase".to_string())
    } else {
        // Local directory checks
        let uploads_dir = std::path::Path::new("uploads");
        let status = if uploads_dir.exists() && uploads_dir.is_dir() {
            let temp_file = uploads_dir.join(".healthcheck");
            if tokio::fs::write(&temp_file, b"ok").await.is_ok() {
                let _ = tokio::fs::remove_file(&temp_file).await;
                "up".to_string()
            } else {
                core_healthy = false;
                "down".to_string()
            }
        } else {
            core_healthy = false;
            "down".to_string()
        };
        (status, "local".to_string())
    };
    let storage_latency = storage_start.elapsed().as_millis();

    let status_str = if core_healthy { "healthy" } else { "unhealthy" };

    HealthStatus {
        status: status_str.to_string(),
        version: env!("CARGO_PKG_VERSION"),
        timestamp: chrono::Utc::now().to_rfc3339(),
        database: DatabaseHealth {
            status: db_status.clone(),
            latency_ms: db_latency,
            pool: DatabasePoolStats {
                total_connections: pool.size(),
                idle_connections: pool.num_idle(),
            },
        },
        search: SearchHealth {
            status: db_status,
            latency_ms: db_latency,
        },
        storage: StorageHealth {
            status: storage_status,
            mode: storage_mode,
            latency_ms: storage_latency,
        },
    }
}
