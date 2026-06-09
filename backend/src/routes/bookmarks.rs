use axum::{extract::State, Json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::models::{StoryResponse, BookmarkRequest, StoryRow};
use crate::routes::stories::build_story_responses_batch;
use crate::errors::AppError;

/// GET /api/bookmarks – List all bookmarked stories
pub async fn list_bookmarks(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<StoryResponse>>, AppError> {
    let rows: Vec<StoryRow> = sqlx::query_as(
        "SELECT stories.id, stories.author_id, COALESCE(profiles.username, 'You') AS author_name, \
         stories.title, stories.type, stories.genre, stories.language, stories.license, \
         stories.status, stories.tags, stories.description, stories.cover, stories.followers, \
         stories.views, stories.likes, stories.earnings, stories.progress, stories.created_at \
         FROM public.stories \
         JOIN public.bookmarks b ON b.story_id = stories.id \
         LEFT JOIN public.profiles ON profiles.id = stories.author_id \
         WHERE b.user_id = $1 \
         ORDER BY b.created_at DESC"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await?;

    let results = build_story_responses_batch(&pool, &rows, Some(&auth)).await?;
    Ok(Json(results))
}

/// GET /api/bookmarks/ids – List bookmarked story IDs only
pub async fn get_bookmark_ids(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<Uuid>>, AppError> {
    let rows: Vec<(Uuid,)> = sqlx::query_as("SELECT story_id FROM public.bookmarks WHERE user_id = $1")
        .bind(auth.user_id)
        .fetch_all(&pool)
        .await?;

    Ok(Json(rows.into_iter().map(|(id,)| id).collect()))
}

/// POST /api/bookmarks – Toggle bookmark for a story
pub async fn toggle_bookmark(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Json(body): Json<BookmarkRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify story exists
    let story_exists: (bool,) = sqlx::query_as("SELECT EXISTS(SELECT 1 FROM public.stories WHERE id = $1)")
        .bind(body.story_id)
        .fetch_one(&pool)
        .await?;
    
    if !story_exists.0 {
        return Err(AppError::not_found("Story not found."));
    }

    let exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT story_id FROM public.bookmarks WHERE user_id = $1 AND story_id = $2"
    )
    .bind(auth.user_id)
    .bind(body.story_id)
    .fetch_optional(&pool)
    .await?;

    if exists.is_some() {
        sqlx::query("DELETE FROM public.bookmarks WHERE user_id = $1 AND story_id = $2")
            .bind(auth.user_id)
            .bind(body.story_id)
            .execute(&pool)
            .await?;
        Ok(Json(serde_json::json!({ "bookmarked": false, "message": "Removed bookmark." })))
    } else {
        sqlx::query("INSERT INTO public.bookmarks (user_id, story_id) VALUES ($1, $2)")
            .bind(auth.user_id)
            .bind(body.story_id)
            .execute(&pool)
            .await?;
        Ok(Json(serde_json::json!({ "bookmarked": true, "message": "Bookmarked story!" })))
    }
}
