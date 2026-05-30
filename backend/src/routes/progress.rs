use axum::{extract::State, Json};
use sqlx::PgPool;
use crate::db::AuthUser;
use crate::models::{ReadingProgressRow, UpdateProgressRequest};
use crate::errors::AppError;

/// GET /api/progress
pub async fn get_progress(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<ReadingProgressRow>>, AppError> {
    let rows = sqlx::query_as::<_, ReadingProgressRow>(
        "SELECT story_id, chapter_id, page_index, updated_at FROM reading_progress WHERE user_id = $1"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

/// POST /api/progress
pub async fn update_progress(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Json(body): Json<UpdateProgressRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    sqlx::query(
        "INSERT INTO reading_progress (user_id, story_id, chapter_id, page_index, updated_at) \
         VALUES ($1, $2, $3, $4, NOW()) \
         ON CONFLICT (user_id, story_id) \
         DO UPDATE SET chapter_id = EXCLUDED.chapter_id, page_index = EXCLUDED.page_index, updated_at = NOW()"
    )
    .bind(auth.user_id)
    .bind(body.story_id)
    .bind(body.chapter_id)
    .bind(body.page_index)
    .execute(&pool)
    .await?;

    Ok(Json(serde_json::json!({ "message": "Progress updated." })))
}
