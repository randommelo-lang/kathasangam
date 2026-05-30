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
    let rows: Vec<NotificationRow> =
        sqlx::query_as("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC")
            .bind(auth.user_id)
            .fetch_all(&pool)
            .await?;
    Ok(Json(rows))
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
