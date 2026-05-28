use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::db::AuthUser;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ProfileResponse {
    pub username: String,
    pub role: String,
    pub avatar_url: String,
    pub bio: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRoleRequest {
    pub role: String,
}

pub async fn get_profile(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<ProfileResponse>, StatusCode> {
    let query_result = sqlx::query_as::<_, ProfileResponse>(
        "SELECT username, role::TEXT, avatar_url, bio FROM profiles WHERE id = $1",
    )
    .bind(auth.user_id)
    .fetch_optional(&pool)
    .await;

    match query_result {
        Ok(Some(p)) => Ok(Json(p)),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(err) => {
            eprintln!("Database error fetching profile for user {}: {:?}", auth.user_id, err);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn update_profile_role(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Json(body): Json<UpdateProfileRoleRequest>,
) -> Result<StatusCode, StatusCode> {
    // Validate role is one of the allowed enum values
    let role = body.role.to_lowercase();
    if role != "reader" && role != "author" && role != "moderator" && role != "admin" {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Secure verification: Only allow setting admin/moderator roles if the user is authorized.
    if role == "admin" || role == "moderator" {
        // Fetch the user's email from auth.users
        let row: Option<(Option<String>,)> = sqlx::query_as(
            "SELECT email FROM auth.users WHERE id = $1"
        )
        .bind(auth.user_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error fetching user email: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        let user_email = row
            .and_then(|r| r.0)
            .ok_or(StatusCode::FORBIDDEN)?
            .to_lowercase();

        let admin_email = std::env::var("ADMIN_EMAIL")
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .to_lowercase();

        if role == "admin" {
            if user_email != admin_email {
                return Err(StatusCode::FORBIDDEN);
            }
        } else if role == "moderator" {
            // Admin is always allowed to switch to moderator role
            if user_email != admin_email {
                let mod_emails_str = std::env::var("MODERATOR_EMAILS").unwrap_or_default();
                let allowed_mods: Vec<String> = mod_emails_str
                    .split(',')
                    .map(|s| s.trim().to_lowercase())
                    .collect();
                if !allowed_mods.contains(&user_email) {
                    return Err(StatusCode::FORBIDDEN);
                }
            }
        }
    }

    sqlx::query("UPDATE profiles SET role = $1::user_role WHERE id = $2")
        .bind(&role)
        .bind(auth.user_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
}

pub async fn update_profile(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Json(body): Json<UpdateProfileRequest>,
) -> Result<StatusCode, StatusCode> {
    if let Some(ref username) = body.username {
        let username_trimmed = username.trim();
        if username_trimmed.is_empty() {
            return Err(StatusCode::BAD_REQUEST);
        }
        // Check if username is already taken by a different user
        let exists: (bool,) = sqlx::query_as(
            "SELECT EXISTS(SELECT 1 FROM profiles WHERE LOWER(username) = LOWER($1) AND id != $2)"
        )
        .bind(username_trimmed)
        .bind(auth.user_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error checking username conflict: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        if exists.0 {
            return Err(StatusCode::CONFLICT);
        }
    }

    let username = body.username.map(|s| s.trim().to_string());
    let avatar_url = body.avatar_url.map(|s| s.trim().to_string());
    let bio = body.bio.map(|s| s.trim().to_string());

    sqlx::query(
        "UPDATE profiles SET \
         username = COALESCE($1, username), \
         avatar_url = COALESCE($2, avatar_url), \
         bio = COALESCE($3, bio) \
         WHERE id = $4"
    )
    .bind(username)
    .bind(avatar_url)
    .bind(bio)
    .bind(auth.user_id)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error updating profile: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::OK)
}

#[derive(Debug, Serialize)]
pub struct UsernameCheckResponse {
    pub available: bool,
}

pub async fn get_public_profile(
    State(pool): State<PgPool>,
    axum::extract::Path(username): axum::extract::Path<String>,
) -> Result<Json<ProfileResponse>, StatusCode> {
    let query_result = sqlx::query_as::<_, ProfileResponse>(
        "SELECT username, role::TEXT, avatar_url, bio FROM profiles WHERE LOWER(username) = LOWER($1)",
    )
    .bind(username.trim())
    .fetch_optional(&pool)
    .await;

    match query_result {
        Ok(Some(p)) => Ok(Json(p)),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(err) => {
            eprintln!("Database error fetching public profile for username {}: {:?}", username, err);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn check_username(
    State(pool): State<PgPool>,
    axum::extract::Path(username): axum::extract::Path<String>,
) -> Result<Json<UsernameCheckResponse>, StatusCode> {
    let username_trimmed = username.trim();
    if username_trimmed.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let exists: (bool,) = sqlx::query_as(
        "SELECT EXISTS(SELECT 1 FROM profiles WHERE LOWER(username) = LOWER($1))"
    )
    .bind(username_trimmed)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        eprintln!("Database error checking username availability: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(UsernameCheckResponse {
        available: !exists.0,
    }))
}

pub async fn delete_profile(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<StatusCode, StatusCode> {
    let mut tx = pool.begin().await.map_err(|e| {
        eprintln!("Failed to begin transaction: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // 1. Delete comments by the user
    sqlx::query("DELETE FROM comments WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("Failed to delete comments: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // 2. Delete library entries by the user
    sqlx::query("DELETE FROM library WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("Failed to delete library entries: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // 3. Delete notifications for the user
    sqlx::query("DELETE FROM notifications WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("Failed to delete notifications: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // 4. Delete tips by the user
    sqlx::query("DELETE FROM tips WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("Failed to delete tips: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // 5. Delete stories owned by the user (and all chapters / page relations first)
    let story_ids: Vec<sqlx::types::Uuid> = sqlx::query_scalar("SELECT id FROM stories WHERE author_id = $1")
        .bind(auth.user_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("Failed to fetch stories: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    for story_id in story_ids {
        sqlx::query("DELETE FROM comments WHERE chapter_id IN (SELECT id FROM chapters WHERE story_id = $1)")
            .bind(story_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                eprintln!("Failed to delete comments for chapters: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        sqlx::query("DELETE FROM chapter_pages WHERE chapter_id IN (SELECT id FROM chapters WHERE story_id = $1)")
            .bind(story_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                eprintln!("Failed to delete chapter pages: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        sqlx::query("DELETE FROM chapter_content WHERE chapter_id IN (SELECT id FROM chapters WHERE story_id = $1)")
            .bind(story_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                eprintln!("Failed to delete chapter content: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        sqlx::query("DELETE FROM chapters WHERE story_id = $1")
            .bind(story_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                eprintln!("Failed to delete chapters: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        sqlx::query("DELETE FROM library WHERE story_id = $1")
            .bind(story_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                eprintln!("Failed to delete story library entries: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        sqlx::query("DELETE FROM tips WHERE story_id = $1")
            .bind(story_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                eprintln!("Failed to delete story tips: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        sqlx::query("DELETE FROM reports WHERE story_id = $1")
            .bind(story_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                eprintln!("Failed to delete story reports: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        sqlx::query("DELETE FROM stories WHERE id = $1")
            .bind(story_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                eprintln!("Failed to delete story: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
    }

    // 6. Delete reports filed by the user
    sqlx::query("DELETE FROM reports WHERE reporter_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("Failed to delete reports: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // 7. Delete the profile itself
    sqlx::query("DELETE FROM profiles WHERE id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("Failed to delete profile: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // 8. Delete user from auth.users (non-fatal, ignore errors if db connection doesn't have privileges)
    sqlx::query("DELETE FROM auth.users WHERE id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("Non-fatal: failed to delete from auth.users: {:?}", e);
        })
        .ok();

    tx.commit().await.map_err(|e| {
        eprintln!("Failed to commit transaction: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::OK)
}

