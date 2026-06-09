use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::models::{
    ReadingListRow, CreateReadingListRequest, AddListEntryRequest,
    ReadingListDetailResponse, StoryRow
};
use crate::routes::stories::build_story_responses_batch;
use crate::errors::AppError;

/// GET /api/reading-lists – List reading lists (user's own plus public lists)
pub async fn list_reading_lists(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<ReadingListRow>>, AppError> {
    let rows = sqlx::query_as::<_, ReadingListRow>(
        "SELECT \
            rl.id, \
            rl.user_id, \
            p.username as username, \
            rl.name, \
            rl.description, \
            rl.is_private, \
            rl.created_at \
        FROM public.reading_lists rl \
        LEFT JOIN public.profiles p ON rl.user_id = p.id \
        WHERE rl.user_id = $1 OR rl.is_private = false \
        ORDER BY rl.created_at DESC"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

/// GET /api/reading-lists/:id – Get details and stories inside a reading list
pub async fn get_reading_list(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(list_id): Path<Uuid>,
) -> Result<Json<ReadingListDetailResponse>, AppError> {
    let list_meta = sqlx::query_as::<_, ReadingListRow>(
        "SELECT \
            rl.id, \
            rl.user_id, \
            p.username as username, \
            rl.name, \
            rl.description, \
            rl.is_private, \
            rl.created_at \
        FROM public.reading_lists rl \
        LEFT JOIN public.profiles p ON rl.user_id = p.id \
        WHERE rl.id = $1"
    )
    .bind(list_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::not_found("Reading list not found."))?;

    if list_meta.is_private && list_meta.user_id != auth.user_id {
        return Err(AppError::forbidden("This reading list is private."));
    }

    let rows: Vec<StoryRow> = sqlx::query_as(
        "SELECT stories.id, stories.author_id, COALESCE(profiles.username, 'You') AS author_name, \
         stories.title, stories.type, stories.genre, stories.language, stories.license, \
         stories.status, stories.tags, stories.description, stories.cover, stories.followers, \
         stories.views, stories.likes, stories.earnings, stories.progress, stories.created_at \
         FROM public.stories \
         JOIN public.reading_list_entries rle ON rle.story_id = stories.id \
         LEFT JOIN public.profiles ON profiles.id = stories.author_id \
         WHERE rle.reading_list_id = $1 \
         ORDER BY rle.created_at ASC"
    )
    .bind(list_id)
    .fetch_all(&pool)
    .await?;

    let stories = build_story_responses_batch(&pool, &rows, Some(&auth)).await?;

    Ok(Json(ReadingListDetailResponse {
        id: list_meta.id,
        user_id: list_meta.user_id,
        username: list_meta.username,
        name: list_meta.name,
        description: list_meta.description,
        is_private: list_meta.is_private,
        created_at: list_meta.created_at,
        stories,
    }))
}

/// POST /api/reading-lists – Create a reading list
pub async fn create_reading_list(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Json(body): Json<CreateReadingListRequest>,
) -> Result<(StatusCode, Json<ReadingListRow>), AppError> {
    if body.name.trim().is_empty() {
        return Err(AppError::bad_request("Reading list name cannot be empty."));
    }

    let list_row = sqlx::query_as::<_, ReadingListRow>(
        "WITH inserted AS ( \
            INSERT INTO public.reading_lists (user_id, name, description, is_private) \
            VALUES ($1, $2, $3, $4) \
            RETURNING id, user_id, name, description, is_private, created_at \
        ) \
        SELECT \
            i.id, \
            i.user_id, \
            p.username as username, \
            i.name, \
            i.description, \
            i.is_private, \
            i.created_at \
        FROM inserted i \
        JOIN public.profiles p ON i.user_id = p.id"
    )
    .bind(auth.user_id)
    .bind(body.name.trim())
    .bind(body.description.map(|s| s.trim().to_string()))
    .bind(body.is_private)
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(list_row)))
}

/// DELETE /api/reading-lists/:id – Delete a reading list
pub async fn delete_reading_list(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(list_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let deleted = sqlx::query("DELETE FROM public.reading_lists WHERE id = $1 AND user_id = $2")
        .bind(list_id)
        .bind(auth.user_id)
        .execute(&pool)
        .await?;

    if deleted.rows_affected() == 0 {
        return Err(AppError::forbidden("You do not have permission to delete this reading list or it does not exist."));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/reading-lists/:id/entries – Add a story to a reading list
pub async fn add_story_to_reading_list(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(list_id): Path<Uuid>,
    Json(body): Json<AddListEntryRequest>,
) -> Result<StatusCode, AppError> {
    // Verify ownership of the reading list
    let list_owner: Option<(Uuid,)> = sqlx::query_as(
        "SELECT user_id FROM public.reading_lists WHERE id = $1"
    )
    .bind(list_id)
    .fetch_optional(&pool)
    .await?;

    let owner_id = list_owner.ok_or_else(|| AppError::not_found("Reading list not found."))?.0;
    if owner_id != auth.user_id {
        return Err(AppError::forbidden("You do not own this reading list."));
    }

    // Verify story exists
    let story_exists: (bool,) = sqlx::query_as("SELECT EXISTS(SELECT 1 FROM public.stories WHERE id = $1)")
        .bind(body.story_id)
        .fetch_one(&pool)
        .await?;
    
    if !story_exists.0 {
        return Err(AppError::not_found("Story not found."));
    }

    sqlx::query(
        "INSERT INTO public.reading_list_entries (reading_list_id, story_id) \
         VALUES ($1, $2) \
         ON CONFLICT (reading_list_id, story_id) DO NOTHING"
    )
    .bind(list_id)
    .bind(body.story_id)
    .execute(&pool)
    .await?;

    Ok(StatusCode::OK)
}

/// DELETE /api/reading-lists/:id/entries/:story_id – Remove a story from a reading list
pub async fn remove_story_from_reading_list(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path((list_id, story_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    // Verify ownership of the reading list
    let list_owner: Option<(Uuid,)> = sqlx::query_as(
        "SELECT user_id FROM public.reading_lists WHERE id = $1"
    )
    .bind(list_id)
    .fetch_optional(&pool)
    .await?;

    let owner_id = list_owner.ok_or_else(|| AppError::not_found("Reading list not found."))?.0;
    if owner_id != auth.user_id {
        return Err(AppError::forbidden("You do not own this reading list."));
    }

    sqlx::query(
        "DELETE FROM public.reading_list_entries WHERE reading_list_id = $1 AND story_id = $2"
    )
    .bind(list_id)
    .bind(story_id)
    .execute(&pool)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}
