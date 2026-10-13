use axum::Json;
use crate::errors::AppError;
use serde::Serialize;

/// Public frontend configuration.
///
/// SB-04: this response must contain ONLY values that are safe to serve to an
/// unauthenticated caller. `ADMIN_EMAIL` and `MODERATOR_EMAILS` used to be included,
/// which leaked the administrator's address and the full moderator roster to anyone.
///
/// They are server-side authorization inputs (see `routes::profile::update_profile_role`,
/// which grants the `admin` role to any account whose auth email matches ADMIN_EMAIL),
/// so publishing them turned the escalation gate into a lookup: on a Supabase project
/// with email confirmation disabled, an attacker could register the known admin address
/// and then claim the role through the intended endpoint.
///
/// Role authorization is enforced server-side; the client never needs these values.
/// Add no further fields without checking whether they are client-visible by design.
#[derive(Debug, Serialize)]
pub struct ConfigResponse {
    pub supabase_url: String,
    pub supabase_anon_key: String,
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

    Ok(Json(ConfigResponse {
        supabase_url,
        supabase_anon_key,
    }))
}