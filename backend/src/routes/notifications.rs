use crate::models::*;
use crate::db::AuthUser;
use axum::{extract::{State, Path}, http::StatusCode, Json};
use sqlx::PgPool;
use uuid::Uuid;
use crate::errors::AppError;

/// GET /api/notifications
pub async fn list_notifications(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<NotificationRow>>, AppError> {
    // 1. Auto-prune notifications older than 3 months
    let _ = sqlx::query("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '3 months'")
        .execute(&pool)
        .await;

    // 2. Fetch active notifications within the 3-month window
    let rows: Vec<NotificationRow> = sqlx::query_as(
        "SELECT id, user_id, message, is_read, story_id, chapter_sort_order, created_at \
         FROM notifications \
         WHERE user_id = $1 AND COALESCE(created_at, NOW()) >= NOW() - INTERVAL '3 months' \
         ORDER BY created_at DESC",
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

/// PATCH /api/notifications/:id/read
pub async fn mark_notification_read(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    sqlx::query("UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(auth.user_id)
        .execute(&pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// PATCH /api/notifications/read-all
pub async fn mark_all_read(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<StatusCode, AppError> {
    sqlx::query("UPDATE notifications SET is_read = TRUE WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/notifications/:id
pub async fn delete_notification(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    sqlx::query("DELETE FROM notifications WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(auth.user_id)
        .execute(&pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/notifications
pub async fn clear_all_notifications(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<StatusCode, AppError> {
    sqlx::query("DELETE FROM notifications WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
