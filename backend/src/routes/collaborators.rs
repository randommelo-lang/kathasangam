use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::models::{CollaboratorResponse, InviteCollaboratorRequest, RespondInviteRequest, PendingInviteResponse};
use crate::errors::AppError;

/// Helper to verify caller is story owner
async fn check_is_owner(pool: &PgPool, user_id: Uuid, story_id: Uuid) -> Result<(), AppError> {
    let row: Option<(Option<Uuid>,)> = sqlx::query_as("SELECT author_id FROM stories WHERE id = $1")
        .bind(story_id)
        .fetch_optional(pool)
        .await?;

    let owner_id = row
        .ok_or_else(|| AppError::not_found("Story not found."))?
        .0;

    if owner_id == Some(user_id) {
        Ok(())
    } else {
        Err(AppError::forbidden("Only the story owner can perform this action."))
    }
}

/// Helper to check if user has collaborate/view access to story drafts
pub async fn check_collaborator_access(pool: &PgPool, user_id: Uuid, story_id: Uuid) -> Result<bool, AppError> {
    let row: Option<(Option<Uuid>,)> = sqlx::query_as("SELECT author_id FROM stories WHERE id = $1")
        .bind(story_id)
        .fetch_optional(pool)
        .await?;

    let owner_id = row
        .ok_or_else(|| AppError::not_found("Story not found."))?
        .0;

    if owner_id == Some(user_id) {
        return Ok(true);
    }

    // Check if user is accepted collaborator
    let collab_exists: (bool,) = sqlx::query_as(
        "SELECT EXISTS(SELECT 1 FROM story_collaborators WHERE story_id = $1 AND user_id = $2 AND status = 'accepted')"
    )
    .bind(story_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if collab_exists.0 {
        return Ok(true);
    }

    // Check if user is admin or moderator
    let role: Option<(String,)> = sqlx::query_as("SELECT role::text FROM profiles WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

    if let Some((r,)) = role {
        if r == "admin" || r == "moderator" {
            return Ok(true);
        }
    }

    Ok(false)
}

/// POST /api/stories/:story_id/collaborators
pub async fn invite_collaborator(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(story_id): Path<Uuid>,
    Json(body): Json<InviteCollaboratorRequest>,
) -> Result<StatusCode, AppError> {
    // Only owner can invite
    check_is_owner(&pool, auth.user_id, story_id).await?;

    // Look up user by username
    let target_user: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM profiles WHERE LOWER(username) = LOWER($1)")
        .bind(body.username.trim())
        .fetch_optional(&pool)
        .await?;

    let target_user_id = target_user
        .ok_or_else(|| AppError::not_found("User not found with that username."))?
        .0;

    // Cannot invite yourself
    if target_user_id == auth.user_id {
        return Err(AppError::bad_request("You cannot invite yourself as a collaborator."));
    }

    // Insert into story_collaborators
    let result = sqlx::query(
        "INSERT INTO story_collaborators (story_id, user_id, role, status) VALUES ($1, $2, $3, 'invited')"
    )
    .bind(story_id)
    .bind(target_user_id)
    .bind(&body.role)
    .execute(&pool)
    .await;

    match result {
        Ok(_) => Ok(StatusCode::CREATED),
        Err(e) => {
            if let Some(db_err) = e.as_database_error() {
                if db_err.is_unique_violation() {
                    return Err(AppError::bad_request("This user has already been invited or is already a collaborator."));
                }
            }
            Err(e.into())
        }
    }
}

/// GET /api/stories/:story_id/collaborators
pub async fn list_collaborators(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(story_id): Path<Uuid>,
) -> Result<Json<Vec<CollaboratorResponse>>, AppError> {
    // Check access
    if !check_collaborator_access(&pool, auth.user_id, story_id).await? {
        return Err(AppError::forbidden("You do not have permission to view collaborators for this story."));
    }

    let rows: Vec<(Uuid, Uuid, String, String, String, String)> = sqlx::query_as(
        "SELECT c.id, c.user_id, p.username, COALESCE(p.avatar_url, '') as avatar_url, c.role, c.status \
         FROM story_collaborators c \
         JOIN profiles p ON c.user_id = p.id \
         WHERE c.story_id = $1 \
         ORDER BY c.created_at ASC"
    )
    .bind(story_id)
    .fetch_all(&pool)
    .await?;

    let result = rows.into_iter().map(|r| {
        CollaboratorResponse {
            id: r.0,
            user_id: r.1,
            username: r.2,
            avatar_url: r.3,
            role: r.4,
            status: r.5,
        }
    }).collect();

    Ok(Json(result))
}

/// DELETE /api/stories/:story_id/collaborators/:user_id
pub async fn remove_collaborator(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path((story_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    // Check if story exists and get owner
    let row: Option<(Option<Uuid>,)> = sqlx::query_as("SELECT author_id FROM stories WHERE id = $1")
        .bind(story_id)
        .fetch_optional(&pool)
        .await?;

    let owner_id = row
        .ok_or_else(|| AppError::not_found("Story not found."))?
        .0;

    // Caller must be story owner OR the collaborator themselves
    if owner_id != Some(auth.user_id) && target_user_id != auth.user_id {
        return Err(AppError::forbidden("You do not have permission to remove this collaborator."));
    }

    let result = sqlx::query("DELETE FROM story_collaborators WHERE story_id = $1 AND user_id = $2")
        .bind(story_id)
        .bind(target_user_id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found("Collaborator association not found."));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/collaborations/invites
pub async fn list_my_invites(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<PendingInviteResponse>>, AppError> {
    let rows: Vec<(Uuid, Uuid, String, String, String, String)> = sqlx::query_as(
        "SELECT c.id, c.story_id, s.title, p_owner.username, c.role, c.status \
         FROM story_collaborators c \
         JOIN stories s ON c.story_id = s.id \
         JOIN profiles p_owner ON s.author_id = p_owner.id \
         WHERE c.user_id = $1 AND c.status = 'invited' \
         ORDER BY c.created_at DESC"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await?;

    let result = rows.into_iter().map(|r| {
        PendingInviteResponse {
            collaboration_id: r.0,
            story_id: r.1,
            story_title: r.2,
            owner_username: r.3,
            role: r.4,
            status: r.5,
        }
    }).collect();

    Ok(Json(result))
}

/// POST /api/collaborations/invites/:id/respond
pub async fn respond_invite(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(invite_id): Path<Uuid>,
    Json(body): Json<RespondInviteRequest>,
) -> Result<StatusCode, AppError> {
    // Check invite details
    let invite: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT user_id, status FROM story_collaborators WHERE id = $1"
    )
    .bind(invite_id)
    .fetch_optional(&pool)
    .await?;

    let (user_id, status) = invite
        .ok_or_else(|| AppError::not_found("Invitation not found."))?;

    if user_id != auth.user_id {
        return Err(AppError::forbidden("You cannot respond to an invite that is not yours."));
    }

    if status != "invited" {
        return Err(AppError::bad_request("This invitation has already been processed."));
    }

    if body.action.to_lowercase() == "accept" {
        sqlx::query("UPDATE story_collaborators SET status = 'accepted' WHERE id = $1")
            .bind(invite_id)
            .execute(&pool)
            .await?;
        Ok(StatusCode::OK)
    } else if body.action.to_lowercase() == "decline" {
        sqlx::query("DELETE FROM story_collaborators WHERE id = $1")
            .bind(invite_id)
            .execute(&pool)
            .await?;
        Ok(StatusCode::OK)
    } else {
        Err(AppError::bad_request("Invalid action. Must be 'accept' or 'decline'."))
    }
}
