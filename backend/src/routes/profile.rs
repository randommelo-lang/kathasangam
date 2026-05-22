use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::db::AuthUser;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ProfileResponse {
    pub username: String,
    pub role: String,
    pub avatar_url: String,
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
        "SELECT username, role::TEXT, avatar_url FROM profiles WHERE id = $1",
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
