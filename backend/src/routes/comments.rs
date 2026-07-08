use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::models::*;
use crate::errors::AppError;

/// GET /api/chapters/:story_id/:index/comments
pub async fn list_comments(
    State(pool): State<PgPool>,
    Path((story_id, index)): Path<(Uuid, i64)>,
) -> Result<Json<Vec<CommentResponse>>, AppError> {
    let ch: ChapterRow =
        sqlx::query_as("SELECT * FROM chapters WHERE story_id = $1 AND sort_order = $2")
            .bind(story_id)
            .bind(index)
            .fetch_optional(&pool)
            .await?
            .ok_or_else(|| AppError::not_found("Chapter not found"))?;

    let rows: Vec<(Uuid, Option<Uuid>, String, String, Option<i32>)> =
        sqlx::query_as(
            "SELECT c.id, c.user_id, c.content, COALESCE(p.username, 'Reader'), c.paragraph_index \
             FROM comments c \
             LEFT JOIN profiles p ON c.user_id = p.id \
             WHERE c.chapter_id = $1 \
             ORDER BY c.created_at"
        )
        .bind(&ch.id)
        .fetch_all(&pool)
        .await?;

    Ok(Json(
        rows.into_iter()
            .map(|(id, user_id, text, username, paragraph_index)| CommentResponse {
                id,
                user_id,
                user: username,
                text,
                paragraph_index,
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
) -> Result<(StatusCode, Json<CommentResponse>), AppError> {
    if body.text.trim().is_empty() {
        return Err(AppError::bad_request("Comment content cannot be empty."));
    }

    let ch: ChapterRow =
        sqlx::query_as("SELECT * FROM chapters WHERE story_id = $1 AND sort_order = $2")
            .bind(story_id)
            .bind(index)
            .fetch_optional(&pool)
            .await?
            .ok_or_else(|| AppError::not_found("Chapter not found"))?;

    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO comments (id, chapter_id, user_id, content, paragraph_index) VALUES ($1,$2,$3,$4,$5)")
        .bind(id)
        .bind(ch.id)
        .bind(user_id)
        .bind(&body.text)
        .bind(body.paragraph_index)
        .execute(&pool)
        .await?;

    // Retrieve commenter's real username from profile
    let username_row: Option<(String,)> = sqlx::query_as(
        "SELECT username FROM profiles WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(&pool)
    .await?;

    let username = username_row.map(|r| r.0).unwrap_or_else(|| "Reader".to_string());

    // Notify story author if commenter is not the author
    let story_info: Option<(Option<Uuid>, String)> = sqlx::query_as(
        "SELECT author_id, title FROM stories WHERE id = $1"
    )
    .bind(story_id)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    if let Some((Some(author_id), story_title)) = story_info {
        if author_id != user_id {
            let message = format!(
                "User '{}' commented on '{}' of your story '{}'",
                username, ch.title, story_title
            );
            let _ = sqlx::query(
                "INSERT INTO notifications (user_id, message, story_id, chapter_sort_order) \
                 SELECT $1, $2, $3, $4 \
                 FROM profiles p \
                 WHERE p.id = $1 AND (COALESCE(p.preferences->>'in_app_notifications', 'true'))::boolean = true"
            )
            .bind(author_id)
            .bind(&message)
            .bind(story_id)
            .bind(ch.sort_order)
            .execute(&pool)
            .await;
        }
    }

    Ok((
        StatusCode::CREATED,
        Json(CommentResponse {
            id,
            user_id: Some(user_id),
            user: username,
            text: body.text,
            paragraph_index: body.paragraph_index,
        }),
    ))
}

/// DELETE /api/comments/:id
pub async fn delete_comment(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(comment_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    // 1. Fetch the comment to check user_id and content
    let comment: Option<(Option<Uuid>, String)> = sqlx::query_as("SELECT user_id, content FROM comments WHERE id = $1")
        .bind(comment_id)
        .fetch_optional(&pool)
        .await?;

    let (comment_user_id, comment_content) = comment
        .ok_or_else(|| AppError::not_found("Comment not found"))?;

    // 2. Check if current user is the owner
    let mut is_authorized = false;
    let mut user_role = String::new();
    if comment_user_id == Some(auth.user_id) {
        is_authorized = true;
    } else {
        // 3. Otherwise, check user's role in profiles
        let role: Option<(String,)> = sqlx::query_as("SELECT role::text FROM profiles WHERE id = $1")
            .bind(auth.user_id)
            .fetch_optional(&pool)
            .await?;
        if let Some((r,)) = role {
            user_role = r.clone();
            if r == "admin" || r == "moderator" {
                is_authorized = true;
            }
        }
    }

    if !is_authorized {
        return Err(AppError::forbidden("You do not have permission to delete this comment."));
    }

    let mut tx = pool.begin().await?;

    if comment_user_id != Some(auth.user_id) {
        let action_name = if user_role == "admin" { "delete_comment_by_admin" } else { "delete_comment_by_moderator" };
        let details = serde_json::json!({
            "comment_content": comment_content,
            "comment_author_id": comment_user_id,
            "is_moderation": true
        });
        sqlx::query(
            "INSERT INTO moderation_audit_logs (moderator_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)"
        )
        .bind(auth.user_id)
        .bind(action_name)
        .bind("comment")
        .bind(comment_id)
        .bind(&details)
        .execute(&mut *tx)
        .await?;
    }

    // 4. Delete the comment
    sqlx::query("DELETE FROM comments WHERE id = $1")
        .bind(comment_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}
