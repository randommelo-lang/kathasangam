use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;
use chrono::NaiveDateTime;

use crate::db::AuthUser;
use crate::models::{CreateInternalNoteRequest, InternalNoteResponse};
use crate::errors::AppError;
use crate::routes::collaborators::check_collaborator_access;

#[derive(serde::Deserialize)]
pub struct NotesQuery {
    #[serde(rename = "chapterId")]
    pub chapter_id: Option<Uuid>,
}

/// GET /api/stories/:story_id/internal-notes
pub async fn list_internal_notes(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(story_id): Path<Uuid>,
    Query(query): Query<NotesQuery>,
) -> Result<Json<Vec<InternalNoteResponse>>, AppError> {
    // Check permission
    if !check_collaborator_access(&pool, auth.user_id, story_id).await? {
        return Err(AppError::forbidden("You do not have permission to view internal notes for this story."));
    }

    let rows: Vec<(Uuid, Uuid, Option<Uuid>, Uuid, String, String, String, NaiveDateTime)> = sqlx::query_as(
        "SELECT n.id, n.story_id, n.chapter_id, n.author_id, p.username, COALESCE(p.avatar_url, '') as avatar_url, n.content, n.created_at \
         FROM story_internal_notes n \
         JOIN profiles p ON n.author_id = p.id \
         WHERE n.story_id = $1 AND ($2::uuid IS NULL OR n.chapter_id = $2) \
         ORDER BY n.created_at ASC"
    )
    .bind(story_id)
    .bind(query.chapter_id)
    .fetch_all(&pool)
    .await?;

    let result = rows.into_iter().map(|r| {
        InternalNoteResponse {
            id: r.0,
            story_id: r.1,
            chapter_id: r.2,
            author_id: r.3,
            author_name: r.4,
            author_avatar: r.5,
            content: r.6,
            created_at: r.7,
        }
    }).collect();

    Ok(Json(result))
}

/// POST /api/stories/:story_id/internal-notes
pub async fn create_internal_note(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(story_id): Path<Uuid>,
    Json(body): Json<CreateInternalNoteRequest>,
) -> Result<(StatusCode, Json<InternalNoteResponse>), AppError> {
    // Check permission
    if !check_collaborator_access(&pool, auth.user_id, story_id).await? {
        return Err(AppError::forbidden("You do not have permission to post internal notes for this story."));
    }

    if body.content.trim().is_empty() {
        return Err(AppError::bad_request("Content cannot be empty."));
    }

    let note_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO story_internal_notes (id, story_id, chapter_id, author_id, content) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(note_id)
    .bind(story_id)
    .bind(body.chapter_id)
    .bind(auth.user_id)
    .bind(body.content.trim())
    .execute(&pool)
    .await?;

    // Fetch the inserted row with author info
    let note: (Uuid, Uuid, Option<Uuid>, Uuid, String, String, String, NaiveDateTime) = sqlx::query_as(
        "SELECT n.id, n.story_id, n.chapter_id, n.author_id, p.username, COALESCE(p.avatar_url, '') as avatar_url, n.content, n.created_at \
         FROM story_internal_notes n \
         JOIN profiles p ON n.author_id = p.id \
         WHERE n.id = $1"
    )
    .bind(note_id)
    .fetch_one(&pool)
    .await?;

    let response = InternalNoteResponse {
        id: note.0,
        story_id: note.1,
        chapter_id: note.2,
        author_id: note.3,
        author_name: note.4,
        author_avatar: note.5,
        content: note.6,
        created_at: note.7,
    };

    Ok((StatusCode::CREATED, Json(response)))
}

/// DELETE /api/stories/:story_id/internal-notes/:note_id
pub async fn delete_internal_note(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path((story_id, note_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    // Check permission
    if !check_collaborator_access(&pool, auth.user_id, story_id).await? {
        return Err(AppError::forbidden("You do not have permission to moderate internal notes for this story."));
    }

    // Fetch note to check author
    let note: Option<(Uuid,)> = sqlx::query_as(
        "SELECT author_id FROM story_internal_notes WHERE id = $1 AND story_id = $2"
    )
    .bind(note_id)
    .bind(story_id)
    .fetch_optional(&pool)
    .await?;

    let note_author_id = note
        .ok_or_else(|| AppError::not_found("Internal note not found."))?
        .0;

    // Get story owner
    let story: (Option<Uuid>,) = sqlx::query_as("SELECT author_id FROM stories WHERE id = $1")
        .bind(story_id)
        .fetch_one(&pool)
        .await?;

    let story_owner_id = story.0;

    // Only note author OR story owner can delete
    if note_author_id != auth.user_id && story_owner_id != Some(auth.user_id) {
        return Err(AppError::forbidden("You do not have permission to delete this note."));
    }

    sqlx::query("DELETE FROM story_internal_notes WHERE id = $1")
        .bind(note_id)
        .execute(&pool)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
