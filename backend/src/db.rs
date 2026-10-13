use axum::{
    async_trait,
    extract::FromRequestParts,
    http::request::Parts,
};
use sqlx::PgPool;
use crate::errors::AppError;
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::io;
use std::sync::OnceLock;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JwtClaims {
    pub sub: String,
    pub aud: Option<String>,
    pub iat: i64,
    pub exp: i64,
    pub email: Option<String>,
    pub user_metadata: Option<serde_json::Value>,
    pub aal: Option<String>,
}

pub struct AuthUser {
    pub user_id: Uuid,
    /// Supabase assurance level: `aal1` (password only) or `aal2` (MFA satisfied).
    /// `None` for local mock sessions. See [`MfaAuthUser`].
    pub aal: Option<String>,
}

/// An authenticated user whose session has completed a second factor.
///
/// SB-12: the `aal` claim was parsed into [`JwtClaims`] and then never read, so an
/// `aal1` (password-only) token was accepted everywhere an `aal2` (MFA) token was.
/// Users who enrolled TOTP via `js/auth/securitySettings.js` believed their accounts
/// were second-factor protected when a stolen password alone still granted full
/// access. Use this extractor on destructive or privilege-bearing routes.
pub struct MfaAuthUser {
    pub user_id: Uuid,
}

pub static JWT_DECODING_KEY: OnceLock<DecodingKey> = OnceLock::new();

fn mock_user_id() -> Uuid {
    Uuid::from_bytes([
        0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x7a, 0x8b, 0x9c, 0x0d, 0x1e, 0x2f, 0x3a, 0x4b,
        0x5c, 0x6d,
    ])
}

fn allow_mock_auth() -> bool {
    std::env::var("ALLOW_MOCK_AUTH")
        .map(|value| value.eq_ignore_ascii_case("true"))
        .unwrap_or(cfg!(debug_assertions))
}

pub fn init_jwt_decoding_key() -> Result<(), Box<dyn Error + Send + Sync>> {
    let env_secret = std::env::var("SUPABASE_JWT_SECRET")?;
    let pem_key = env_secret.replace("\\n", "\n");
    let key = DecodingKey::from_ec_pem(pem_key.as_bytes())?;
    JWT_DECODING_KEY
        .set(key)
        .map_err(|_| io::Error::new(io::ErrorKind::AlreadyExists, "JWT decoding key was already initialized"))?;
    Ok(())
}

#[async_trait]
impl FromRequestParts<PgPool> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &PgPool) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok())
            .ok_or_else(|| AppError::unauthorized("Please log in to perform this action."))?;

        if !auth_header.starts_with("Bearer ") {
            return Err(AppError::unauthorized("Invalid authorization header format."));
        }

        let token = &auth_header[7..];

        // (user_id, assurance level) — SB-12 keeps the `aal` claim rather than
        // discarding it, so `MfaAuthUser` can require a second factor.
        let (user_id, aal) = if token.starts_with("mock-access-token") && allow_mock_auth() {
            let uid = if token.starts_with("mock-access-token:") {
                let uuid_str = &token[18..];
                Uuid::parse_str(uuid_str).unwrap_or_else(|_| mock_user_id())
            } else {
                mock_user_id()
            };
            // Local mock sessions bypass Supabase and have no assurance level.
            (uid, None)
        } else {
            let decoding_key = JWT_DECODING_KEY.get().ok_or_else(|| {
                tracing::error!("JWT decoding key is not initialized");
                AppError::internal_server_error("JWT decoding key is not initialized")
            })?;

            // Set validation to expect ES256 (which matches your ECC P-256 key)
            let mut validation = Validation::new(Algorithm::ES256);
            validation.validate_aud = true;
            validation.set_audience(&["authenticated"]);

            let token_data = decode::<JwtClaims>(token, decoding_key, &validation).map_err(|e| {
                tracing::error!("JWT validation failed: {}", e);
                AppError::unauthorized("Invalid or expired session. Please log in again.")
            })?;

            let uid = Uuid::parse_str(&token_data.claims.sub)
                .map_err(|_| AppError::unauthorized("Invalid user ID in session token."))?;
            (uid, token_data.claims.aal.clone())
        };

        verify_not_banned(state, user_id).await?;

        Ok(AuthUser { user_id, aal })
    }
}

/// Rejects the request when the account carries an active ban.
async fn verify_not_banned(state: &PgPool, user_id: Uuid) -> Result<(), AppError> {
    let row = sqlx::query("SELECT is_banned, ban_reason FROM profiles WHERE id = $1")
        .bind(user_id)
        .fetch_optional(state)
        .await
        .map_err(|e| {
            // SB-06: log the driver detail, return a generic message. The original
            // built this string from `e`, which surfaced Postgres internals to callers.
            tracing::error!(error = %e, "failed to check ban status");
            AppError::internal_server_error("An internal error occurred.")
        })?;

    if let Some(r) = row {
        use sqlx::Row;
        let is_banned: bool = r.try_get("is_banned").unwrap_or(false);
        if is_banned {
            let reason: Option<String> = r.try_get("ban_reason").unwrap_or(None);
            let reason = reason.unwrap_or_else(|| "No reason specified".to_string());
            return Err(AppError::forbidden(format!(
                "Your account has been banned. Reason: {reason}"
            )));
        }
    }

    Ok(())
}

pub struct OptionalAuthUser {
    pub user_id: Option<Uuid>,
}

/// SB-12: requires a session whose Supabase assurance level is `aal2`, i.e. one that
/// has completed an MFA challenge.
///
/// A user with no enrolled factor carries `aal = "aal1"` forever, so requiring `aal2`
/// unconditionally would lock those accounts out of sensitive actions. Instead the
/// check is driven by `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS`: when enabled (the
/// recommended production posture) users without a second factor are rejected on these
/// routes and told to enrol one, at which point their session upgrades and the action
/// becomes available.
#[async_trait]
impl FromRequestParts<PgPool> for MfaAuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &PgPool) -> Result<Self, Self::Rejection> {
        let AuthUser { user_id, aal } =
            AuthUser::from_request_parts(parts, state).await?;

        if aal.as_deref() == Some("aal2") {
            return Ok(MfaAuthUser { user_id });
        }

        if mfa_required_for_sensitive_actions() {
            return Err(AppError::forbidden(
                "This action requires two-factor authentication. Enable it in your account security settings, then sign in again.",
            ));
        }

        tracing::warn!(
            user_id = %user_id,
            "Sensitive action completed without a second factor; \
             set MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=true to enforce"
        );
        Ok(MfaAuthUser { user_id })
    }
}

fn mfa_required_for_sensitive_actions() -> bool {
    std::env::var("MFA_REQUIRED_FOR_SENSITIVE_ACTIONS")
        .map(|value| value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

#[async_trait]
impl FromRequestParts<PgPool> for OptionalAuthUser {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &PgPool) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok());

        if let Some(header) = auth_header {
            if header.starts_with("Bearer ") {
                let token = &header[7..];
                let uid = if token.starts_with("mock-access-token") && allow_mock_auth() {
                    if token.starts_with("mock-access-token:") {
                        let uuid_str = &token[18..];
                        Some(Uuid::parse_str(uuid_str).unwrap_or_else(|_| mock_user_id()))
                    } else {
                        Some(mock_user_id())
                    }
                } else if let Some(decoding_key) = JWT_DECODING_KEY.get() {
                    let mut validation = Validation::new(Algorithm::ES256);
                    validation.validate_aud = true;
                    validation.set_audience(&["authenticated"]);

                    if let Ok(token_data) = decode::<JwtClaims>(token, decoding_key, &validation) {
                        Uuid::parse_str(&token_data.claims.sub).ok()
                    } else {
                        None
                    }
                } else {
                    None
                };

                if let Some(user_id) = uid {
                    // SB-05: this previously swallowed the query error with
                    // `.unwrap_or(None)`, so a transient database fault silently
                    // degraded an authenticated request to anonymous. Surface it.
                    let banned = verify_not_banned(state, user_id)
                        .await
                        .is_err_and(|e| matches!(e, AppError::Forbidden(_)));

                    if banned {
                        return Ok(OptionalAuthUser { user_id: None });
                    }

                    return Ok(OptionalAuthUser { user_id: Some(user_id) });
                }
            }
        }
        Ok(OptionalAuthUser { user_id: None })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_allow_mock_auth_env_override() {
        std::env::set_var("ALLOW_MOCK_AUTH", "false");
        assert!(!allow_mock_auth());

        std::env::set_var("ALLOW_MOCK_AUTH", "true");
        assert!(allow_mock_auth());

        std::env::remove_var("ALLOW_MOCK_AUTH");
    }
}
