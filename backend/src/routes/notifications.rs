use crate::models::*;
use crate::db::AuthUser;
use axum::{extract::State, http::StatusCode, Json};
use sqlx::PgPool;

/// GET /api/notifications
pub async fn list_notifications(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<String>>, StatusCode> {
    let rows: Vec<NotificationRow> =
        sqlx::query_as("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at")
            .bind(auth.user_id)
            .fetch_all(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(rows.iter().map(|n| n.message.clone()).collect()))
}
