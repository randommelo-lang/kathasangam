use crate::models::*;
use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::errors::AppError;

/// POST /api/stories/:id/tip
pub async fn tip_story(
    State(pool): State<PgPool>,
    AuthUser { user_id }: AuthUser,
    Path(story_id): Path<Uuid>,
    Json(body): Json<TipRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let amount = body.amount.unwrap_or(5);
    let tip_id = Uuid::new_v4();
    sqlx::query("INSERT INTO tips (id, story_id, user_id, amount) VALUES ($1, $2, $3, $4)")
        .bind(tip_id)
        .bind(story_id)
        .bind(user_id)
        .bind(amount)
        .execute(&pool)
        .await?;
    sqlx::query("UPDATE stories SET earnings = earnings + $1 WHERE id = $2")
        .bind(amount)
        .bind(story_id)
        .execute(&pool)
        .await?;
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT COALESCE(profiles.username, 'the author')
         FROM stories
         LEFT JOIN profiles ON profiles.id = stories.author_id
         WHERE stories.id = $1",
    )
    .bind(story_id)
    .fetch_optional(&pool)
    .await?;
    let author = row
        .map(|(a,)| a)
        .unwrap_or_else(|| "the author".to_string());
    Ok(Json(
        serde_json::json!({ "message": format!("Demo tip sent to {}.", author) }),
    ))
}
