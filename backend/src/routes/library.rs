use axum::{extract::State, Json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::models::*;
use crate::routes::stories::build_story_responses_batch;
use crate::errors::AppError;

/// GET /api/library
pub async fn get_library(
    State(pool): State<PgPool>,
    auth: AuthUser,
) -> Result<Json<Vec<StoryResponse>>, AppError> {
    let story_ids: Vec<(Uuid,)> = sqlx::query_as("SELECT story_id FROM library WHERE user_id = $1")
        .bind(auth.user_id)
        .fetch_all(&pool)
        .await?;

    let ids: Vec<Uuid> = story_ids.into_iter().map(|(id,)| id).collect();
    if ids.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let rows: Vec<StoryRow> = sqlx::query_as(
        "SELECT stories.id, stories.author_id, COALESCE(profiles.username, 'You') AS author_name, \
         stories.title, stories.type, stories.genre, stories.language, stories.license, \
         stories.status, stories.tags, stories.description, stories.cover, stories.followers, \
         stories.views, stories.likes, stories.earnings, stories.progress, stories.created_at \
         FROM stories LEFT JOIN profiles ON profiles.id = stories.author_id \
         WHERE stories.id = ANY($1)",
    )
    .bind(&ids)
    .fetch_all(&pool)
    .await?;

    let results = build_story_responses_batch(&pool, &rows, Some(&auth))
        .await?;

    Ok(Json(results))
}

/// GET /api/library/ids – just the list of followed story IDs
pub async fn get_library_ids(
    State(pool): State<PgPool>,
    AuthUser { user_id }: AuthUser,
) -> Result<Json<Vec<Uuid>>, AppError> {
    let rows: Vec<(Uuid,)> = sqlx::query_as("SELECT story_id FROM library WHERE user_id = $1")
        .bind(user_id)
        .fetch_all(&pool)
        .await?;

    Ok(Json(rows.into_iter().map(|(id,)| id).collect()))
}

/// POST /api/library/follow
pub async fn toggle_follow(
    State(pool): State<PgPool>,
    AuthUser { user_id }: AuthUser,
    Json(body): Json<FollowRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let exists: Option<(Uuid,)> =
        sqlx::query_as("SELECT story_id FROM library WHERE user_id = $1 AND story_id = $2")
            .bind(user_id)
            .bind(body.story_id)
            .fetch_optional(&pool)
            .await?;

    if exists.is_some() {
        sqlx::query("DELETE FROM library WHERE user_id = $1 AND story_id = $2")
            .bind(user_id)
            .bind(body.story_id)
            .execute(&pool)
            .await?;
        Ok(Json(
            serde_json::json!({ "followed": false, "message": "Removed from library." }),
        ))
    } else {
        sqlx::query("INSERT INTO library (user_id, story_id) VALUES ($1, $2)")
            .bind(user_id)
            .bind(body.story_id)
            .execute(&pool)
            .await?;
        Ok(Json(
            serde_json::json!({ "followed": true, "message": "Added to library." }),
        ))
    }
}
