use axum::{extract::State, http::StatusCode, Json};
use sqlx::PgPool;
use serde::Serialize;
use std::time::Instant;

#[derive(Serialize)]
pub struct HealthStatus {
    pub status: String,
    pub database: DatabaseHealth,
    pub search: SearchHealth,
    pub storage: StorageHealth,
}

#[derive(Serialize)]
pub struct DatabaseHealth {
    pub status: String,
    pub latency_ms: u128,
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

pub async fn health_check(State(pool): State<PgPool>) -> Result<Json<HealthStatus>, (StatusCode, Json<HealthStatus>)> {
    let mut is_healthy = true;

    // 1. Check Database
    let db_start = Instant::now();
    let db_res = sqlx::query("SELECT 1")
        .execute(&pool)
        .await;
    let db_latency = db_start.elapsed().as_millis();
    let db_status = match db_res {
        Ok(_) => "up".to_string(),
        Err(_) => {
            is_healthy = false;
            "down".to_string()
        }
    };

    // 2. Check Meilisearch
    let search_start = Instant::now();
    let search_res = crate::search::check_health().await;
    let search_latency = search_start.elapsed().as_millis();
    let search_status = match search_res {
        Ok(_) => "up".to_string(),
        Err(_) => {
            is_healthy = false;
            "down".to_string()
        }
    };

    // 3. Check Storage (Supabase Storage or Local Uploads)
    let storage_start = Instant::now();
    let supabase_url = std::env::var("SUPABASE_URL").unwrap_or_default();
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").unwrap_or_default();

    let (storage_status, storage_mode) = if !supabase_url.is_empty() && !service_role_key.is_empty() {
        // Query Supabase Storage Health Endpoint
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .build()
            .unwrap();
        let health_url = format!("{}/storage/v1/health", supabase_url);
        let storage_res = client
            .get(&health_url)
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .send()
            .await;
        
        let status = match storage_res {
            Ok(resp) if resp.status().is_success() => "up".to_string(),
            _ => {
                is_healthy = false;
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
                is_healthy = false;
                "down".to_string()
            }
        } else {
            is_healthy = false;
            "down".to_string()
        };
        (status, "local".to_string())
    };
    let storage_latency = storage_start.elapsed().as_millis();

    let status_str = if is_healthy { "healthy" } else { "unhealthy" };

    let health_response = HealthStatus {
        status: status_str.to_string(),
        database: DatabaseHealth {
            status: db_status,
            latency_ms: db_latency,
        },
        search: SearchHealth {
            status: search_status,
            latency_ms: search_latency,
        },
        storage: StorageHealth {
            status: storage_status,
            mode: storage_mode,
            latency_ms: storage_latency,
        },
    };

    if is_healthy {
        Ok(Json(health_response))
    } else {
        Err((StatusCode::SERVICE_UNAVAILABLE, Json(health_response)))
    }
}
