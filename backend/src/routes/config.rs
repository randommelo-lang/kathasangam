use axum::Json;
use crate::errors::AppError;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ConfigResponse {
    pub supabase_url: String,
    pub supabase_anon_key: String,
    pub admin_email: String,
    pub moderator_emails: Vec<String>,
}

/// GET /api/config — returns public Supabase config to the frontend
/// These are public values (anon key is designed to be client-facing)
pub async fn get_config() -> Result<Json<ConfigResponse>, AppError> {
    let supabase_url = std::env::var("SUPABASE_URL").map_err(|_| {
        tracing::error!("Missing SUPABASE_URL env var");
        AppError::internal_server_error("Server configuration error: SUPABASE_URL is missing.")
    })?;

    let supabase_anon_key = std::env::var("SUPABASE_ANON_KEY").map_err(|_| {
        tracing::error!("Missing SUPABASE_ANON_KEY env var");
        AppError::internal_server_error("Server configuration error: SUPABASE_ANON_KEY is missing.")
    })?;

    let admin_email = std::env::var("ADMIN_EMAIL").unwrap_or_default();
    let mod_emails_str = std::env::var("MODERATOR_EMAILS").unwrap_or_default();
    let moderator_emails: Vec<String> = mod_emails_str
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(Json(ConfigResponse {
        supabase_url,
        supabase_anon_key,
        admin_email,
        moderator_emails,
    }))
}
