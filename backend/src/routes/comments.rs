use axum::{
    extract::{Path, State, Query},
    http::StatusCode,
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::{AuthUser, OptionalAuthUser};
use crate::models::*;
use crate::errors::AppError;

/// Returns true when the user holds a moderator or administrator role.
async fn is_staff(pool: &PgPool, user_id: Uuid) -> bool {
    let role: Option<(String,)> = sqlx::query_as("SELECT role::text FROM profiles WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);
    matches!(role, Some((r,)) if r == "admin" || r == "moderator")
}

/// Rejects access to a chapter that is a draft or is scheduled for a future release.
/// Used to close SB-09 on the comment route, which previously exposed discussions
/// attached to unpublished chapters.
async fn require_published_chapter(_pool: &PgPool, chapter: &ChapterRow) -> Result<(), AppError> {
    let status = chapter.status.to_lowercase();
    let scheduled_future = chapter
        .scheduled_at
        .map(|at| at > chrono::Utc::now().naive_utc())
        .unwrap_or(false);

    if status == "published" && !scheduled_future {
        Ok(())
    } else {
        Err(AppError::forbidden(
            "You do not have permission to view comments on this chapter.",
        ))
    }
}

/// GET /api/chapters/:story_id/:index/comments
pub async fn list_comments(
    // SB-09 & F-003: this route validates story publication status, NSFW policy,
    // and chapter publication status so discussions are not leaked on private/draft stories.
    auth: OptionalAuthUser,
    State(pool): State<PgPool>,
    Path((story_id, index)): Path<(Uuid, i64)>,
) -> Result<Json<Vec<CommentResponse>>, AppError> {
    let story: Option<(Option<Uuid>, String, bool)> =
        sqlx::query_as("SELECT author_id, status, is_nsfw FROM stories WHERE id = $1")
            .bind(story_id)
            .fetch_optional(&pool)
            .await?;

    let (story_author_id, story_status, is_nsfw) = match story {
        Some(s) => s,
        None => return Err(AppError::not_found("Story not found.")),
    };

    let ch: ChapterRow =
        sqlx::query_as("SELECT * FROM chapters WHERE story_id = $1 AND sort_order = $2")
            .bind(story_id)
            .bind(index)
            .fetch_optional(&pool)
            .await?
            .ok_or_else(|| AppError::not_found("Chapter not found"))?;

    let is_collab = if let Some(uid) = auth.user_id {
        crate::routes::collaborators::check_collaborator_access(&pool, uid, story_id)
            .await
            .unwrap_or(false)
            || is_staff(&pool, uid).await
    } else {
        false
    };

    let is_author_or_collab = auth
        .user_id
        .map(|uid| Some(uid) == story_author_id || is_collab)
        .unwrap_or(false);

    // Enforce publication status and NSFW gate for non-members (F-003)
    if !is_author_or_collab {
        let status_lower = story_status.to_lowercase();
        if status_lower == "draft" || status_lower == "unpublished" {
            return Err(AppError::forbidden("This story is not published."));
        }

        if is_nsfw {
            let mut allowed = false;
            if let Some(uid) = auth.user_id {
                let is_18 = crate::routes::stories::is_user_eighteen_plus(&pool, uid).await;
                let pref = crate::routes::stories::get_user_nsfw_preference(&pool, uid).await;
                if is_18 && pref != "hide" {
                    allowed = true;
                }
            }
            if !allowed {
                return Err(AppError::forbidden(
                    "Underage or unauthenticated accounts are not permitted to view NSFW content.",
                ));
            }
        }

        require_published_chapter(&pool, &ch).await?;
    }

    let rows: Vec<(Uuid, Option<Uuid>, String, String, Option<i32>, Option<Uuid>, bool)> =
        sqlx::query_as(
            "SELECT c.id, c.user_id, c.content, COALESCE(p.username, 'Reader'), c.paragraph_index, c.parent_id, \
                    EXISTS ( \
                        SELECT 1 FROM tips t \
                        WHERE t.user_id = c.user_id \
                          AND t.status = 'completed' \
                          AND (t.story_id = $2 OR t.author_id = (SELECT author_id FROM stories WHERE id = $2)) \
                    ) AS is_supporter \
             FROM comments c \
             LEFT JOIN profiles p ON c.user_id = p.id \
             WHERE c.chapter_id = $1 \
             ORDER BY c.created_at"
        )
        .bind(&ch.id)
        .bind(story_id)
        .fetch_all(&pool)
        .await?;

    Ok(Json(
        rows.into_iter()
            .map(|(id, user_id, text, username, paragraph_index, parent_id, is_supporter)| {
                let is_deleted = text == "[deleted]" || user_id.is_none();
                CommentResponse {
                    id,
                    user_id,
                    user: if is_deleted { "[deleted]".to_string() } else { username },
                    text,
                    paragraph_index,
                    parent_id,
                    is_supporter: if is_deleted { false } else { is_supporter },
                }
            })
            .collect(),
    ))
}

/// POST /api/chapters/:story_id/:index/comments
pub async fn create_comment(
    State(pool): State<PgPool>,
    AuthUser { user_id, .. }: AuthUser,
    Path((story_id, index)): Path<(Uuid, i64)>,
    Json(body): Json<CreateCommentRequest>,
) -> Result<(StatusCode, Json<CommentResponse>), AppError> {
    if body.text.trim().is_empty() {
        return Err(AppError::bad_request("Comment content cannot be empty."));
    }
    if body.text.chars().count() > 5000 {
        return Err(AppError::bad_request("Comment content cannot exceed 5000 characters."));
    }

    let story: Option<(Option<Uuid>, String, bool)> =
        sqlx::query_as("SELECT author_id, status, is_nsfw FROM stories WHERE id = $1")
            .bind(story_id)
            .fetch_optional(&pool)
            .await?;

    let (story_author_id, story_status, is_nsfw) = match story {
        Some(s) => s,
        None => return Err(AppError::not_found("Story not found.")),
    };

    let ch: ChapterRow =
        sqlx::query_as("SELECT * FROM chapters WHERE story_id = $1 AND sort_order = $2")
            .bind(story_id)
            .bind(index)
            .fetch_optional(&pool)
            .await?
            .ok_or_else(|| AppError::not_found("Chapter not found"))?;

    let is_collab = crate::routes::collaborators::check_collaborator_access(&pool, user_id, story_id)
        .await
        .unwrap_or(false)
        || is_staff(&pool, user_id).await;

    let is_author_or_collab = Some(user_id) == story_author_id || is_collab;

    // F-004: Validate story & chapter status for non-authors
    if !is_author_or_collab {
        let status_lower = story_status.to_lowercase();
        if status_lower == "draft" || status_lower == "unpublished" {
            return Err(AppError::forbidden("Cannot comment on an unpublished story."));
        }

        if is_nsfw {
            let is_18 = crate::routes::stories::is_user_eighteen_plus(&pool, user_id).await;
            let pref = crate::routes::stories::get_user_nsfw_preference(&pool, user_id).await;
            if !is_18 || pref == "hide" {
                return Err(AppError::forbidden(
                    "Underage or unauthenticated accounts are not permitted to view NSFW content.",
                ));
            }
        }

        require_published_chapter(&pool, &ch).await?;
    }

    // Check if story author has blocked this user (F-006)
    let author_prefs: Option<(Option<serde_json::Value>,)> = sqlx::query_as(
        "SELECT p.preferences FROM profiles p \
         JOIN stories s ON s.author_id = p.id \
         WHERE s.id = $1"
    )
    .bind(story_id)
    .fetch_optional(&pool)
    .await?;

    if let Some((Some(prefs),)) = author_prefs {
        if let Some(blocked) = prefs.get("blocked_users").and_then(|v| v.as_array()) {
            let uid_str = user_id.to_string();
            if blocked.iter().any(|u| {
                u.as_str() == Some(&uid_str)
                    || u.get("id").and_then(|v| v.as_str()) == Some(&uid_str)
            }) {
                return Err(AppError::forbidden("You cannot comment on stories by an author who has blocked you."));
            }
        }
    }

    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO comments (id, chapter_id, user_id, content, paragraph_index, parent_id) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(id)
        .bind(ch.id)
        .bind(user_id)
        .bind(&body.text)
        .bind(body.paragraph_index)
        .bind(body.parent_id)
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

    // Check if commenter has supported this story or creator
    let is_supporter: bool = sqlx::query_scalar(
        "SELECT EXISTS ( \
            SELECT 1 FROM tips t \
            WHERE t.user_id = $1 \
              AND t.status = 'completed' \
              AND (t.story_id = $2 OR t.author_id = (SELECT author_id FROM stories WHERE id = $2)) \
        )"
    )
    .bind(user_id)
    .bind(story_id)
    .fetch_one(&pool)
    .await
    .unwrap_or(false);

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
            parent_id: body.parent_id,
            is_supporter,
        }),
    ))
}

/// DELETE /api/comments/:id
pub async fn delete_comment(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(comment_id): Path<Uuid>,
    Query(query): Query<DeleteQuery>,
) -> Result<StatusCode, AppError> {
    // 1. Fetch the comment to check user_id, content, and parent_id
    let comment: Option<(Option<Uuid>, String, Option<Uuid>)> = sqlx::query_as("SELECT user_id, content, parent_id FROM comments WHERE id = $1")
        .bind(comment_id)
        .fetch_optional(&pool)
        .await?;

    let (comment_user_id, comment_content, comment_parent_id) = comment
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

        if let Some(author_id) = comment_user_id {
            let reason_str = query.reason.as_deref().unwrap_or("No reason specified");
            let message = format!("Your comment '{}' was removed by a moderator. Reason: {}", comment_content, reason_str);
            let _ = sqlx::query(
                "INSERT INTO notifications (user_id, message) VALUES ($1, $2)"
            )
            .bind(author_id)
            .bind(&message)
            .execute(&mut *tx)
            .await;
        }
    }

    // 4. Soft-delete if comment has replies so conversation tree is preserved; else hard-delete
    let reply_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM comments WHERE parent_id = $1"
    )
    .bind(comment_id)
    .fetch_one(&mut *tx)
    .await?;

    if reply_count.0 > 0 {
        sqlx::query("UPDATE comments SET content = '[deleted]', user_id = NULL WHERE id = $1")
            .bind(comment_id)
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query("DELETE FROM comments WHERE id = $1")
            .bind(comment_id)
            .execute(&mut *tx)
            .await?;

        // If parent was soft-deleted and now has no remaining replies, prune it as well (F-025)
        if let Some(pid) = comment_parent_id {
            sqlx::query("DELETE FROM comments WHERE id = $1 AND content = '[deleted]' AND user_id IS NULL AND NOT EXISTS (SELECT 1 FROM comments WHERE parent_id = $1)")
                .bind(pid)
                .execute(&mut *tx)
                .await?;
        }
    }

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}
