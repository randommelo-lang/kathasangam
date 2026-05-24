use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::models::*;

/// GET /api/chapters/:story_id/:index/comments
pub async fn list_comments(
    State(pool): State<PgPool>,
    Path((story_id, index)): Path<(Uuid, i64)>,
) -> Result<Json<Vec<CommentResponse>>, StatusCode> {
    let ch: ChapterRow =
        sqlx::query_as("SELECT * FROM chapters WHERE story_id = $1 AND sort_order = $2")
            .bind(story_id)
            .bind(index)
            .fetch_optional(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::NOT_FOUND)?;

    let rows: Vec<(Uuid, Option<Uuid>, String, String)> =
        sqlx::query_as(
            "SELECT c.id, c.user_id, c.content, COALESCE(p.username, 'Reader') \
             FROM comments c \
             LEFT JOIN profiles p ON c.user_id = p.id \
             WHERE c.chapter_id = $1 \
             ORDER BY c.created_at"
        )
        .bind(&ch.id)
        .fetch_all(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(
        rows.into_iter()
            .map(|(id, user_id, text, username)| CommentResponse {
                id,
                user_id,
                user: username,
                text,
            })
            .collect(),
    ))
}

/// POST /api/chapters/:story_id/:index/comments
pub async fn create_comment(
    State(pool): State<PgPool>,
    AuthUser { user_id }: AuthUser,
    Path((story_id, index)): Path<(Uuid, i64)>,
    Json(body): Json<CreateCommentRequest>,
) -> Result<(StatusCode, Json<CommentResponse>), StatusCode> {
    let ch: ChapterRow =
        sqlx::query_as("SELECT * FROM chapters WHERE story_id = $1 AND sort_order = $2")
            .bind(story_id)
            .bind(index)
            .fetch_optional(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::NOT_FOUND)?;

    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO comments (id, chapter_id, user_id, content) VALUES ($1,$2,$3,$4)")
        .bind(id)
        .bind(ch.id)
        .bind(user_id)
        .bind(&body.text)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Retrieve commenter's real username from profile
    let username_row: Option<(String,)> = sqlx::query_as(
        "SELECT username FROM profiles WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let username = username_row.map(|r| r.0).unwrap_or_else(|| "Reader".to_string());

    Ok((
        StatusCode::CREATED,
        Json(CommentResponse {
            id,
            user_id: Some(user_id),
            user: username,
            text: body.text,
        }),
    ))
}

/// DELETE /api/comments/:id
pub async fn delete_comment(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(comment_id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    // 1. Fetch the comment to check user_id
    let comment: Option<(Option<Uuid>,)> = sqlx::query_as("SELECT user_id FROM comments WHERE id = $1")
        .bind(comment_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let comment_user_id = comment
        .ok_or(StatusCode::NOT_FOUND)?
        .0;

    // 2. Check if current user is the owner
    let mut is_authorized = false;
    if comment_user_id == Some(auth.user_id) {
        is_authorized = true;
    } else {
        // 3. Otherwise, check user's role in profiles
        let role: Option<(String,)> = sqlx::query_as("SELECT role::text FROM profiles WHERE id = $1")
            .bind(auth.user_id)
            .fetch_optional(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        if let Some((r,)) = role {
            if r == "admin" || r == "moderator" {
                is_authorized = true;
            }
        }
    }

    if !is_authorized {
        return Err(StatusCode::FORBIDDEN);
    }

    // 4. Delete the comment
    sqlx::query("DELETE FROM comments WHERE id = $1")
        .bind(comment_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}
