use crate::models::*;
use crate::db::AuthUser;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

async fn check_is_staff(pool: &PgPool, user_id: Uuid) -> Result<bool, StatusCode> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT role::text FROM profiles WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| {
        eprintln!("Database error checking staff status: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if let Some((role,)) = row {
        Ok(role == "admin" || role == "moderator")
    } else {
        Ok(false)
    }
}

/// GET /api/reports
pub async fn list_reports(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<ReportRow>>, StatusCode> {
    if !check_is_staff(&pool, auth.user_id).await? {
        return Err(StatusCode::FORBIDDEN);
    }

    let rows: Vec<ReportRow> = sqlx::query_as("SELECT * FROM reports")
        .fetch_all(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows))
}

/// PATCH /api/reports/:id
pub async fn update_report(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateReportRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !check_is_staff(&pool, auth.user_id).await? {
        return Err(StatusCode::FORBIDDEN);
    }

    // Fetch the previous report status and targets for auditing
    let prev_report: Option<(String, String, Uuid)> = sqlx::query_as(
        "SELECT status, target_type, target_id FROM reports WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error fetching report: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (prev_status, target_type, target_id) = match prev_report {
        Some(r) => r,
        None => return Err(StatusCode::NOT_FOUND),
    };

    sqlx::query("UPDATE reports SET status = $1 WHERE id = $2")
        .bind(&body.status)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Log the moderation action
    let details = serde_json::json!({
        "previous_status": prev_status,
        "new_status": body.status,
        "target_type": target_type,
        "target_id": target_id
    });

    sqlx::query(
        "INSERT INTO moderation_audit_logs (moderator_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(auth.user_id)
    .bind(format!("status_update_{}", body.status))
    .bind("report")
    .bind(id)
    .bind(&details)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Failed to write moderation audit log: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(
        serde_json::json!({ "message": format!("Report {}.", body.status) }),
    ))
}

/// GET /api/reports/logs
pub async fn list_audit_logs(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<AuditLogRow>>, StatusCode> {
    if !check_is_staff(&pool, auth.user_id).await? {
        return Err(StatusCode::FORBIDDEN);
    }

    let rows: Vec<AuditLogRow> = sqlx::query_as(
        "SELECT l.id, l.moderator_id, p.username AS moderator_name, l.action, l.target_type, l.target_id, l.details, l.created_at \
         FROM moderation_audit_logs l \
         LEFT JOIN profiles p ON l.moderator_id = p.id \
         ORDER BY l.created_at DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error fetching audit logs: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(rows))
}

