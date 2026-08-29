use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::{AuthUser, OptionalAuthUser};
use crate::errors::AppError;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PublicProfileResponse {
    pub id: Uuid,
    pub username: String,
    pub role: String,
    pub avatar_url: String,
    pub bio: String,
    pub followers_count: i64,
    pub following_count: i64,
    pub is_following: bool,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ProfileResponse {
    pub username: String,
    pub role: String,
    pub avatar_url: String,
    pub bio: String,
    pub preferences: serde_json::Value,
    pub followers_count: i64,
    pub following_count: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRoleRequest {
    pub role: String,
}

pub async fn get_profile(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<ProfileResponse>, AppError> {
    let profile = sqlx::query_as::<_, ProfileResponse>(
        "SELECT username, role::TEXT, avatar_url, bio, preferences, \
         (SELECT COUNT(*) FROM public.follows WHERE followed_id = $1) AS followers_count, \
         (SELECT COUNT(*) FROM public.follows WHERE follower_id = $1) AS following_count \
         FROM profiles WHERE id = $1",
    )
    .bind(auth.user_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::not_found("Profile not found."))?;

    Ok(Json(profile))
}

pub async fn update_profile_role(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Json(body): Json<UpdateProfileRoleRequest>,
) -> Result<StatusCode, AppError> {
    // Validate role is one of the allowed enum values
    let role = body.role.to_lowercase();
    if role != "reader" && role != "author" && role != "moderator" && role != "admin" {
        return Err(AppError::bad_request("Invalid role value specified."));
    }

    // Secure verification: Only allow setting admin/moderator roles if the user is authorized.
    if role == "admin" || role == "moderator" {
        // Fetch the user's email from auth.users
        let row: Option<(Option<String>,)> = sqlx::query_as(
            "SELECT email FROM auth.users WHERE id = $1"
        )
        .bind(auth.user_id)
        .fetch_optional(&pool)
        .await?;

        let user_email = row
            .and_then(|r| r.0)
            .ok_or_else(|| AppError::forbidden("Forbidden: user has no registered email."))?
            .to_lowercase();

        let admin_email = std::env::var("ADMIN_EMAIL")
            .map_err(|_| AppError::internal_server_error("Server configuration error: ADMIN_EMAIL environment variable missing."))?
            .to_lowercase();

        if role == "admin" {
            if user_email != admin_email {
                return Err(AppError::forbidden("You are not authorized to switch to the admin role."));
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
                    return Err(AppError::forbidden("You are not authorized to switch to the moderator role."));
                }
            }
        }
    }

    sqlx::query("UPDATE profiles SET role = $1::user_role WHERE id = $2")
        .bind(&role)
        .bind(auth.user_id)
        .execute(&pool)
        .await?;

    Ok(StatusCode::OK)
}

/// Validates that an avatar URL is either empty (to clear the avatar),
/// a local upload path, or a Supabase Storage URL matching our configured host.
fn is_valid_avatar_url(url: &str) -> bool {
    let url = url.trim();
    // Empty string clears the avatar
    if url.is_empty() {
        return true;
    }

    // Local upload path
    if url.starts_with("/uploads/") {
        let filename = &url["/uploads/".len()..];
        // Must have a filename with a valid image extension, no path traversal
        if filename.is_empty() || filename.contains('/') || filename.contains("..") || filename.contains('?') || filename.contains('#') {
            return false;
        }
        let valid_exts = ["webp", "png", "jpg", "jpeg", "gif"];
        return filename.rsplit('.').next()
            .map(|ext| valid_exts.contains(&ext.to_lowercase().as_str()))
            .unwrap_or(false);
    }

    // Supabase Storage public URL
    if let Ok(supabase_url) = std::env::var("SUPABASE_URL") {
        if !supabase_url.is_empty() {
            let expected_prefix = format!("{}/storage/v1/object/public/kathasangam/", supabase_url);
            if url.starts_with(&expected_prefix) {
                let filename = &url[expected_prefix.len()..];
                // Must have a filename with a valid image extension, no path traversal
                if filename.is_empty() || filename.contains('/') || filename.contains("..") || filename.contains('?') || filename.contains('#') {
                    return false;
                }
                let valid_exts = ["webp", "png", "jpg", "jpeg", "gif"];
                return filename.rsplit('.').next()
                    .map(|ext| valid_exts.contains(&ext.to_lowercase().as_str()))
                    .unwrap_or(false);
            }
        }
    }

    false
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
    pub preferences: Option<serde_json::Value>,
}

pub async fn update_profile(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Json(body): Json<UpdateProfileRequest>,
) -> Result<StatusCode, AppError> {
    if let Some(ref username) = body.username {
        let username_trimmed = username.trim();
        if username_trimmed.is_empty() {
            return Err(AppError::bad_request("Username cannot be empty."));
        }
        // Check if username is already taken by a different user
        let exists: (bool,) = sqlx::query_as(
            "SELECT EXISTS(SELECT 1 FROM profiles WHERE LOWER(username) = LOWER($1) AND id != $2)"
        )
        .bind(username_trimmed)
        .bind(auth.user_id)
        .fetch_one(&pool)
        .await?;

        if exists.0 {
            return Err(AppError::BadRequest("This username is already taken.".to_string()));
        }
    }

    let mut old_avatar_url: Option<String> = None;
    let mut avatar_was_replaced = false;

    if let Some(ref new_avatar) = body.avatar_url {
        // Validate the avatar URL format
        if !is_valid_avatar_url(new_avatar) {
            return Err(AppError::bad_request(
                "Invalid avatar URL. Please upload an avatar image using the upload button."
            ));
        }

        // Query the old avatar url to check if it has changed
        let row: Option<(Option<String>,)> = sqlx::query_as("SELECT avatar_url FROM profiles WHERE id = $1")
            .bind(auth.user_id)
            .fetch_optional(&pool)
            .await?;
        if let Some((Some(old_avatar),)) = row {
            if &old_avatar != new_avatar {
                avatar_was_replaced = true;
                old_avatar_url = Some(old_avatar);
            }
        }
    }

    let username = body.username.map(|s| s.trim().to_string());
    let avatar_url = body.avatar_url.map(|s| s.trim().to_string());
    let bio = body.bio.map(|s| s.trim().to_string());

    sqlx::query(
        "UPDATE profiles SET \
         username = COALESCE($1, username), \
         avatar_url = COALESCE($2, avatar_url), \
         bio = COALESCE($3, bio), \
         preferences = COALESCE($4, preferences) \
         WHERE id = $5"
    )
    .bind(username)
    .bind(avatar_url)
    .bind(bio)
    .bind(body.preferences)
    .bind(auth.user_id)
    .execute(&pool)
    .await?;

    if avatar_was_replaced {
        if let Some(ref url) = old_avatar_url {
            // Only delete the old file if no other profile or story cover references it
            let ref_count: (i64,) = sqlx::query_as(
                "SELECT (SELECT COUNT(*) FROM profiles WHERE avatar_url = $1) + \
                 (SELECT COUNT(*) FROM stories WHERE cover = $1)"
            )
            .bind(url)
            .fetch_one(&pool)
            .await
            .unwrap_or((0,));

            if ref_count.0 == 0 {
                let url_owned = url.clone();
                tokio::spawn(async move {
                    crate::routes::upload::delete_uploaded_file(&url_owned).await;
                });
            }
        }
    }

    Ok(StatusCode::OK)
}

#[derive(Debug, Serialize)]
pub struct UsernameCheckResponse {
    pub available: bool,
}

pub async fn get_public_profile(
    State(pool): State<PgPool>,
    opt_auth: OptionalAuthUser,
    axum::extract::Path(username): axum::extract::Path<String>,
) -> Result<Json<PublicProfileResponse>, AppError> {
    let profile = sqlx::query_as::<_, PublicProfileResponse>(
        "SELECT id, username, role::TEXT, avatar_url, bio, \
         (SELECT COUNT(*) FROM public.follows WHERE followed_id = id) AS followers_count, \
         (SELECT COUNT(*) FROM public.follows WHERE follower_id = id) AS following_count, \
         COALESCE((SELECT EXISTS(SELECT 1 FROM public.follows WHERE follower_id = $2 AND followed_id = id)), false) AS is_following \
         FROM profiles WHERE LOWER(username) = LOWER($1)",
    )
    .bind(username.trim())
    .bind(opt_auth.user_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::not_found("Public profile not found."))?;

    Ok(Json(profile))
}

pub async fn check_username(
    State(pool): State<PgPool>,
    axum::extract::Path(username): axum::extract::Path<String>,
) -> Result<Json<UsernameCheckResponse>, AppError> {
    let username_trimmed = username.trim();
    if username_trimmed.is_empty() {
        return Err(AppError::bad_request("Username cannot be empty."));
    }

    let exists: (bool,) = sqlx::query_as(
        "SELECT EXISTS(SELECT 1 FROM profiles WHERE LOWER(username) = LOWER($1))"
    )
    .bind(username_trimmed)
    .fetch_one(&pool)
    .await?;

    Ok(Json(UsernameCheckResponse {
        available: !exists.0,
    }))
}

pub async fn delete_profile(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<StatusCode, AppError> {
    // Retrieve cover URLs of all stories being deleted
    let story_covers: Vec<Option<String>> = sqlx::query_scalar("SELECT cover FROM stories WHERE author_id = $1")
        .bind(auth.user_id)
        .fetch_all(&pool)
        .await?;

    // Retrieve the user's profile avatar_url
    let avatar_url: Option<Option<String>> = sqlx::query_scalar("SELECT avatar_url FROM profiles WHERE id = $1")
        .bind(auth.user_id)
        .fetch_optional(&pool)
        .await?;

    let mut tx = pool.begin().await?;

    // 1. Delete comments by the user
    sqlx::query("DELETE FROM comments WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 2. Delete library entries by the user
    sqlx::query("DELETE FROM library WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 3. Delete notifications for the user
    sqlx::query("DELETE FROM notifications WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 4. Delete tips by the user
    sqlx::query("DELETE FROM tips WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 5. Delete stories owned by the user (and all chapters / page relations first)
    let story_ids: Vec<sqlx::types::Uuid> = sqlx::query_scalar("SELECT id FROM stories WHERE author_id = $1")
        .bind(auth.user_id)
        .fetch_all(&mut *tx)
        .await?;

    for story_id in story_ids {
        sqlx::query("DELETE FROM comments WHERE chapter_id IN (SELECT id FROM chapters WHERE story_id = $1)")
            .bind(story_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM chapter_pages WHERE chapter_id IN (SELECT id FROM chapters WHERE story_id = $1)")
            .bind(story_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM chapter_content WHERE chapter_id IN (SELECT id FROM chapters WHERE story_id = $1)")
            .bind(story_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM chapters WHERE story_id = $1")
            .bind(story_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM library WHERE story_id = $1")
            .bind(story_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM tips WHERE story_id = $1")
            .bind(story_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM reports WHERE story_id = $1")
            .bind(story_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM stories WHERE id = $1")
            .bind(story_id)
            .execute(&mut *tx)
            .await?;
    }

    // 6. Delete reports filed by the user
    sqlx::query("DELETE FROM reports WHERE reporter_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 7. Delete the profile itself
    sqlx::query("DELETE FROM profiles WHERE id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 8. Delete user from auth.users (non-fatal, ignore errors if db connection doesn't have privileges)
    let _ = sqlx::query("DELETE FROM auth.users WHERE id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            tracing::warn!("Non-fatal: failed to delete from auth.users: {:?}", e);
        });

    tx.commit().await?;

    // Delete story covers asynchronously after successful commit
    for cover_opt in story_covers {
        if let Some(cover_url) = cover_opt {
            tokio::spawn(async move {
                crate::routes::upload::delete_uploaded_file(&cover_url).await;
            });
        }
    }

    // Delete user profile avatar asynchronously after successful commit
    if let Some(Some(url)) = avatar_url {
        tokio::spawn(async move {
            crate::routes::upload::delete_uploaded_file(&url).await;
        });
    }

    Ok(StatusCode::OK)
}

pub async fn toggle_follow_user(
    auth: AuthUser,
    State(pool): State<PgPool>,
    axum::extract::Path(followed_id): axum::extract::Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    if auth.user_id == followed_id {
        return Err(AppError::bad_request("You cannot follow yourself."));
    }

    // Check if the followed user exists
    let exists: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM profiles WHERE id = $1")
        .bind(followed_id)
        .fetch_optional(&pool)
        .await?;

    if exists.is_none() {
        return Err(AppError::not_found("User profile not found."));
    }

    let is_following: Option<(Uuid, Uuid)> =
        sqlx::query_as("SELECT follower_id, followed_id FROM public.follows WHERE follower_id = $1 AND followed_id = $2")
            .bind(auth.user_id)
            .bind(followed_id)
            .fetch_optional(&pool)
            .await?;

    if is_following.is_some() {
        sqlx::query("DELETE FROM public.follows WHERE follower_id = $1 AND followed_id = $2")
            .bind(auth.user_id)
            .bind(followed_id)
            .execute(&pool)
            .await?;
        Ok(Json(
            serde_json::json!({ "followed": false, "message": "Unfollowed user." }),
        ))
    } else {
        sqlx::query("INSERT INTO public.follows (follower_id, followed_id) VALUES ($1, $2)")
            .bind(auth.user_id)
            .bind(followed_id)
            .execute(&pool)
            .await?;
        Ok(Json(
            serde_json::json!({ "followed": true, "message": "Followed user." }),
        ))
    }
}
