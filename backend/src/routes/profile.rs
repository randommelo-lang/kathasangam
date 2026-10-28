use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::{AuthUser, MfaAuthUser, OptionalAuthUser};
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
    auth: MfaAuthUser,
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

const MAX_USERNAME_LENGTH: usize = 30;
const MAX_BIO_LENGTH: usize = 500;

/// SB-19: the username was previously accepted with any characters at all, so a
/// zero-width joiner, a combining accent, or an RTL override could be embedded to make
/// one account render almost identically to another. Restrict to characters that
/// cannot change how the surrounding text is displayed or ordered.
fn validate_username(username: &str) -> Result<(), &'static str> {
    if username.is_empty() {
        return Err("Username cannot be empty.");
    }
    if username.chars().count() > MAX_USERNAME_LENGTH {
        return Err("Username must be 30 characters or fewer.");
    }
    if username.starts_with('_') {
        return Err("Username cannot begin with an underscore.");
    }
    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-')
    {
        return Err(
            "Username may only contain letters, numbers, underscores, dots and hyphens.",
        );
    }
    Ok(())
}

/// Validates that an avatar URL is either empty (to clear the avatar),
/// a local upload path, or a Supabase Storage URL matching our configured host.
///
/// SB-08: delegates to the shared validator in `routes::upload` so avatars and story
/// covers are held to exactly the same rules. They were previously two independent
/// implementations, and only the avatar one constrained path traversal.
fn is_valid_avatar_url(url: &str) -> bool {
    crate::routes::upload::is_valid_stored_media_url(url)
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
        if let Err(message) = validate_username(username_trimmed) {
            return Err(AppError::bad_request(message));
        }
        // SB-18: bound the length so profile rows cannot grow without limit.
        if let Some(ref bio) = body.bio {
            if bio.chars().count() > MAX_BIO_LENGTH {
                return Err(AppError::bad_request(format!(
                    "Bio must be {MAX_BIO_LENGTH} characters or fewer."
                )));
            }
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

    // SB-18: bound the length so profile rows cannot grow without limit.
    if let Some(ref bio) = body.bio {
        if bio.chars().count() > MAX_BIO_LENGTH {
            return Err(AppError::bad_request(format!(
                "Bio must be {MAX_BIO_LENGTH} characters or fewer."
            )));
        }
    }

    // F-009: Protect two_factor_email_enabled from unverified modification.
    if let Some(ref prefs) = body.preferences {
        let existing_prefs: Option<(Option<serde_json::Value>,)> = sqlx::query_as(
            "SELECT preferences FROM profiles WHERE id = $1"
        )
        .bind(auth.user_id)
        .fetch_optional(&pool)
        .await?;

        let current_2fa_enabled = existing_prefs
            .and_then(|(p,)| p)
            .and_then(|p| p.get("two_factor_email_enabled").and_then(|v| v.as_bool()))
            .unwrap_or(false);

        let requested_2fa = prefs.get("two_factor_email_enabled").and_then(|v| v.as_bool());

        // Disabling 2FA requires an MFA session
        if current_2fa_enabled && requested_2fa == Some(false) {
            if auth.aal.as_deref() != Some("aal2") {
                return Err(AppError::forbidden(
                    "Disabling two-factor authentication requires a verified second-factor session."
                ));
            }
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
         preferences = CASE \
             WHEN $4::jsonb IS NOT NULL THEN COALESCE(preferences, '{}'::jsonb) || $4::jsonb \
             ELSE preferences \
         END \
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
            // F-010: Only delete the old file if no other profile, story cover, or comic chapter page references it
            let ref_count: (i64,) = sqlx::query_as(
                "SELECT (SELECT COUNT(*) FROM profiles WHERE avatar_url = $1) + \
                 (SELECT COUNT(*) FROM stories WHERE cover = $1) + \
                 (SELECT COUNT(*) FROM chapter_pages WHERE bg = $1 OR bg = 'url(''' || $1 || ''')')"
            )
            .bind(url)
            .fetch_one(&pool)
            .await
            .unwrap_or((1,));

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
    // SB-15: this was unauthenticated, turning the endpoint into an account-existence
    // oracle that could be enumerated at the shared per-IP rate limit. The check is
    // only meaningful while choosing a username, i.e. while signed in.
    auth: AuthUser,
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

    let _ = auth; // authenticated: see the note above

    Ok(Json(UsernameCheckResponse {
        available: !exists.0,
    }))
}

#[derive(Debug, Serialize)]
pub struct UserDataExport {
    pub export_timestamp: String,
    pub platform: String,
    pub user_id: Uuid,
    pub username: String,
    pub email: Option<String>,
    pub role: String,
    pub avatar_url: String,
    pub bio: String,
    pub preferences: serde_json::Value,
    pub reading_progress: Vec<serde_json::Value>,
    pub library: Vec<serde_json::Value>,
    pub bookmarks: Vec<serde_json::Value>,
    pub reading_lists: Vec<serde_json::Value>,
    pub authored_stories: Vec<serde_json::Value>,
    pub comments: Vec<serde_json::Value>,
    pub direct_messages: Vec<serde_json::Value>,
    pub following_count: i64,
    pub followers_count: i64,
}

/// GET /api/profile/export – Export complete user personal data as JSON
pub async fn export_user_data(
    auth: MfaAuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<UserDataExport>, AppError> {
    // 1. Fetch user profile
    let profile_row = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<serde_json::Value>)>(
        "SELECT username, role::TEXT, avatar_url, bio, preferences FROM profiles WHERE id = $1"
    )
    .bind(auth.user_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::not_found("Profile not found."))?;

    // 2. Fetch email from auth.users (if accessible)
    let email_row: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT email FROM auth.users WHERE id = $1"
    )
    .bind(auth.user_id)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    let email = email_row.and_then(|r| r.0);

    // 3. Fetch reading progress
    let progress_rows: Vec<(Uuid, Uuid, i32, chrono::NaiveDateTime)> = sqlx::query_as(
        "SELECT story_id, chapter_id, page_index, updated_at FROM reading_progress WHERE user_id = $1"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let reading_progress = progress_rows.into_iter().map(|(story_id, chapter_id, page, updated)| {
        serde_json::json!({
            "story_id": story_id,
            "chapter_id": chapter_id,
            "page_index": page,
            "updated_at": updated.to_string(),
        })
    }).collect();

    // 4. Fetch library entries
    let library_rows: Vec<(Uuid, Option<chrono::NaiveDateTime>)> = sqlx::query_as(
        "SELECT story_id, created_at FROM library WHERE user_id = $1"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let library = library_rows.into_iter().map(|(story_id, created)| {
        serde_json::json!({
            "story_id": story_id,
            "created_at": created.map(|c| c.to_string()),
        })
    }).collect();

    // 5. Fetch bookmarks
    let bookmark_rows: Vec<(Uuid, chrono::NaiveDateTime)> = sqlx::query_as(
        "SELECT story_id, created_at FROM bookmarks WHERE user_id = $1"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let bookmarks = bookmark_rows.into_iter().map(|(story_id, created)| {
        serde_json::json!({
            "story_id": story_id,
            "created_at": created.to_string(),
        })
    }).collect();

    // 6. Fetch reading lists
    let list_rows: Vec<(Uuid, String, Option<String>, bool, chrono::NaiveDateTime)> = sqlx::query_as(
        "SELECT id, name, description, is_private, created_at FROM reading_lists WHERE user_id = $1"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let reading_lists = list_rows.into_iter().map(|(id, name, desc, is_private, created)| {
        serde_json::json!({
            "id": id,
            "name": name,
            "description": desc,
            "is_private": is_private,
            "created_at": created.to_string(),
        })
    }).collect();

    // 7. Fetch authored stories
    let story_rows: Vec<(Uuid, String, String, String, String, String, String, Option<chrono::NaiveDateTime>)> = sqlx::query_as(
        "SELECT id, title, type, genre, language, license, status, created_at FROM stories WHERE author_id = $1"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let authored_stories = story_rows.into_iter().map(|(id, title, stype, genre, lang, license, status, created)| {
        serde_json::json!({
            "id": id,
            "title": title,
            "type": stype,
            "genre": genre,
            "language": lang,
            "license": license,
            "status": status,
            "created_at": created.map(|c| c.to_string()),
        })
    }).collect();

    // 8. Fetch comments
    let comment_rows: Vec<(Uuid, Uuid, String, Option<chrono::NaiveDateTime>)> = sqlx::query_as(
        "SELECT id, chapter_id, content, created_at FROM comments WHERE user_id = $1"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let comments = comment_rows.into_iter().map(|(id, chapter_id, content, created)| {
        serde_json::json!({
            "id": id,
            "chapter_id": chapter_id,
            "content": content,
            "created_at": created.map(|c| c.to_string()),
        })
    }).collect();

    // 9. Fetch direct messages
    let msg_rows: Vec<(Uuid, Uuid, Uuid, String, chrono::NaiveDateTime)> = sqlx::query_as(
        "SELECT id, sender_id, receiver_id, content, created_at FROM direct_messages WHERE sender_id = $1 OR receiver_id = $1"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let direct_messages = msg_rows.into_iter().map(|(id, sender_id, receiver_id, content, created)| {
        serde_json::json!({
            "id": id,
            "sender_id": sender_id,
            "receiver_id": receiver_id,
            "content": content,
            "created_at": created.to_string(),
        })
    }).collect();

    // 10. Followers and following counts
    let counts: (i64, i64) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM follows WHERE followed_id = $1) AS followers_count, \
                (SELECT COUNT(*) FROM follows WHERE follower_id = $1) AS following_count"
    )
    .bind(auth.user_id)
    .fetch_one(&pool)
    .await
    .unwrap_or((0, 0));

    Ok(Json(UserDataExport {
        export_timestamp: chrono::Utc::now().to_rfc3339(),
        platform: "KathaSangam".to_string(),
        user_id: auth.user_id,
        username: profile_row.0,
        email,
        role: profile_row.1,
        avatar_url: profile_row.2.unwrap_or_default(),
        bio: profile_row.3.unwrap_or_default(),
        preferences: profile_row.4.unwrap_or_else(|| serde_json::json!({})),
        reading_progress,
        library,
        bookmarks,
        reading_lists,
        authored_stories,
        comments,
        direct_messages,
        followers_count: counts.0,
        following_count: counts.1,
    }))
}

pub async fn delete_profile(
    auth: MfaAuthUser,
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

    // 3. Delete reading progress by the user
    sqlx::query("DELETE FROM reading_progress WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 4. Delete bookmarks by the user
    sqlx::query("DELETE FROM bookmarks WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 5. Delete reading list entries & reading lists owned by the user
    sqlx::query("DELETE FROM reading_lists WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 6. Delete direct messages sent or received by the user
    sqlx::query("DELETE FROM direct_messages WHERE sender_id = $1 OR receiver_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 7. Delete follows (both follower and followed)
    sqlx::query("DELETE FROM follows WHERE follower_id = $1 OR followed_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 8. Delete story collaboration invites & participation
    sqlx::query("DELETE FROM story_collaborators WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 9. Delete notifications for the user
    sqlx::query("DELETE FROM notifications WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 10. Delete tips by the user
    sqlx::query("DELETE FROM tips WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 11. Delete stories owned by the user (and all chapters / page relations first)
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

        sqlx::query("DELETE FROM bookmarks WHERE story_id = $1")
            .bind(story_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM reading_progress WHERE story_id = $1")
            .bind(story_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM story_collaborators WHERE story_id = $1")
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

    // 12. Delete reports filed by the user
    sqlx::query("DELETE FROM reports WHERE reporter_id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 13. Delete the profile itself
    sqlx::query("DELETE FROM profiles WHERE id = $1")
        .bind(auth.user_id)
        .execute(&mut *tx)
        .await?;

    // 14. Delete user from auth.users (non-fatal, ignore errors if db connection doesn't have privileges)
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

    // Check if the followed user exists and fetch preferences (F-011)
    let followed_profile: Option<(Option<serde_json::Value>,)> = sqlx::query_as("SELECT preferences FROM profiles WHERE id = $1")
        .bind(followed_id)
        .fetch_optional(&pool)
        .await?;

    let followed_prefs = match followed_profile {
        Some((p,)) => p,
        None => return Err(AppError::not_found("User profile not found.")),
    };

    if let Some(prefs) = followed_prefs {
        if let Some(blocked) = prefs.get("blocked_users").and_then(|v| v.as_array()) {
            let uid_str = auth.user_id.to_string();
            if blocked.iter().any(|u| u.as_str() == Some(&uid_str)) {
                return Err(AppError::forbidden("You cannot follow a user who has blocked you."));
            }
        }
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

#[cfg(test)]
mod username_tests {
    use super::validate_username;

    // SB-19: the goal is to reject codepoints that can make one account render
    // indistinguishably from another, not to police style.

    #[test]
    fn accepts_ordinary_usernames() {
        assert!(validate_username("melophile").is_ok());
        assert!(validate_username("a.b-c_d").is_ok());
        assert!(validate_username("User123").is_ok());
    }

    #[test]
    fn rejects_empty_and_overlong() {
        assert!(validate_username("").is_err());
        assert!(validate_username(&"a".repeat(31)).is_err());
        assert!(validate_username(&"a".repeat(30)).is_ok());
    }

    #[test]
    fn rejects_leading_underscore() {
        assert!(validate_username("_admin").is_err());
    }

    #[test]
    fn rejects_invisible_and_direction_changing_codepoints() {
        // Zero-width space / joiner / non-joiner.
        assert!(validate_username("ad\u{200B}min").is_err());
        assert!(validate_username("ad\u{200C}min").is_err());
        assert!(validate_username("ad\u{200D}min").is_err());
        // Right-to-left override: renders "nimda" while sorting as "admin".
        assert!(validate_username("admin\u{202E}").is_err());
        // Combining marks used to imitate another glyph.
        assert!(validate_username("admi\u{0301}n").is_err());
        // Bidi isolates.
        assert!(validate_username("\u{2066}admin\u{2069}").is_err());
    }

    #[test]
    fn rejects_whitespace_and_punctuation() {
        assert!(validate_username("two words").is_err());
        assert!(validate_username("<script>").is_err());
        assert!(validate_username("a/b").is_err());
        assert!(validate_username("a@b").is_err());
    }
}
