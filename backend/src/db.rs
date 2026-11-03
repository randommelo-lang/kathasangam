use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, Method},
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
        .unwrap_or(false)
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
            // Local mock sessions bypass Supabase and only allow the fixed mock user identity
            (mock_user_id(), None)
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

        // Supabase treats a missing assurance claim as aal1 as well.
        if aal.as_deref() != Some("aal2") {
            let (email_enabled, factor_verified) = two_factor_status(state, user_id).await?;
            // The email login flow reads preferences here before sending its OTP.
            // TOTP challenges run directly against Supabase and need no API exception.
            let email_login_profile_read = email_enabled && !factor_verified
                && parts.method == Method::GET && parts.uri.path() == "/api/profile";
            if (email_enabled || factor_verified) && !email_login_profile_read {
                return Err(AppError::forbidden(
                    "Two-factor authentication required. Please complete 2FA verification to perform this action.",
                ));
            }
        }

        Ok(AuthUser { user_id, aal })
    }
}

/// Read both the application preference and Supabase's authoritative factor state.
async fn two_factor_status(state: &PgPool, user_id: Uuid) -> Result<(bool, bool), AppError> {
    let (email_enabled, factor_verified, rls_active): (bool, bool, bool) = sqlx::query_as(
        "SELECT COALESCE((SELECT (preferences->>'two_factor_email_enabled')::boolean \
         FROM profiles WHERE id = $1), false), \
         EXISTS (SELECT 1 FROM auth.mfa_factors WHERE user_id = $1 AND status = 'verified'), \
         row_security_active('auth.mfa_factors'::regclass)"
    )
    .bind(user_id)
    .fetch_one(state)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "failed to check 2fa status");
        AppError::internal_server_error("An internal error occurred.")
    })?;
    // A policy-filtered result cannot establish that no verified factor exists.
    if rls_active {
        tracing::error!("row security prevents a reliable MFA factor lookup");
        return Err(AppError::internal_server_error("An internal error occurred."));
    }
    Ok((email_enabled, factor_verified))
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

        let is_2fa_enabled: bool = sqlx::query_scalar(
            "SELECT COALESCE((preferences->>'two_factor_email_enabled')::boolean, false) FROM profiles WHERE id = $1"
        )
        .bind(user_id)
        .fetch_optional(state)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "failed to check 2fa status for MFA user");
            AppError::internal_server_error("An internal error occurred.")
        })?
        .unwrap_or(false);

        if is_2fa_enabled || mfa_required_for_sensitive_actions() {
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
                let (uid, aal) = if token.starts_with("mock-access-token") && allow_mock_auth() {
                    (Some(mock_user_id()), None)
                } else if let Some(decoding_key) = JWT_DECODING_KEY.get() {
                    let mut validation = Validation::new(Algorithm::ES256);
                    validation.validate_aud = true;
                    validation.set_audience(&["authenticated"]);

                    if let Ok(token_data) = decode::<JwtClaims>(token, decoding_key, &validation) {
                        (Uuid::parse_str(&token_data.claims.sub).ok(), token_data.claims.aal)
                    } else {
                        (None, None)
                    }
                } else {
                    (None, None)
                };

                if let Some(user_id) = uid {
                    if verify_not_banned(state, user_id).await.is_err() {
                        return Ok(OptionalAuthUser { user_id: None });
                    }

                    if aal.as_deref() != Some("aal2") {
                        // Fail closed if factor state cannot be read.
                        if !matches!(two_factor_status(state, user_id).await, Ok((false, false))) {
                            return Ok(OptionalAuthUser { user_id: None });
                        }
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

#[cfg(test)]
mod mfa_integration_tests {
    use super::*;
    use axum::http::Request;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use sqlx::postgres::PgPoolOptions;

    // Synthetic test key, used only to exercise JWT validation in this fixture.
    const PRIVATE_KEY: &str = "-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgmUAoefaukm21Q6b+\nZi7i6LjvXzx9szVkKjUappVnGsqhRANCAAQ1l93ceyDQ1tB7XKFNcMdDQ0JsAR9M\nkEL0RuwD/A88I/EQGMZ1pah9m1SJ9LjRe/lWEMBctTiF3xC9VdphRbwv\n-----END PRIVATE KEY-----";
    const PUBLIC_KEY: &str = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAENZfd3Hsg0NbQe1yhTXDHQ0NCbAEf\nTJBC9EbsA/wPPCPxEBjGdaWofZtUifS40Xv5VhDAXLU4hd8QvVXaYUW8Lw==\n-----END PUBLIC KEY-----";

    fn request(user: Uuid, aal: Option<&str>, method: &str, path: &str) -> Parts {
        let claims = JwtClaims {
            sub: user.to_string(), aud: Some("authenticated".into()), iat: 0,
            exp: 4_102_444_800, email: None, user_metadata: None,
            aal: aal.map(str::to_owned),
        };
        let token = encode(&Header::new(Algorithm::ES256), &claims,
            &EncodingKey::from_ec_pem(PRIVATE_KEY.as_bytes()).unwrap()).unwrap();
        Request::builder().method(method).uri(path)
            .header("Authorization", format!("Bearer {token}"))
            .body(()).unwrap().into_parts().0
    }

    async fn required(pool: &PgPool, user: Uuid, aal: Option<&str>, method: &str, path: &str) -> Result<AuthUser, AppError> {
        AuthUser::from_request_parts(&mut request(user, aal, method, path), pool).await
    }

    async fn optional(pool: &PgPool, user: Uuid, aal: Option<&str>) -> Option<Uuid> {
        OptionalAuthUser::from_request_parts(&mut request(user, aal, "GET", "/api/stories"), pool)
            .await.unwrap().user_id
    }

    // Run against an empty disposable database, never a real Supabase project.
    #[tokio::test]
    #[ignore = "requires an empty disposable PostgreSQL database in TEST_DATABASE_URL"]
    async fn verified_factors_require_aal2_for_required_and_optional_auth() {
        let pool = PgPoolOptions::new().max_connections(2)
            .connect(&std::env::var("TEST_DATABASE_URL").unwrap()).await.unwrap();
        assert!(JWT_DECODING_KEY.set(DecodingKey::from_ec_pem(PUBLIC_KEY.as_bytes()).unwrap()).is_ok());
        sqlx::query("CREATE SCHEMA auth").execute(&pool).await.unwrap();
        sqlx::query("CREATE TYPE auth.factor_status AS ENUM ('unverified', 'verified')").execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE auth.mfa_factors (user_id UUID NOT NULL, status auth.factor_status NOT NULL)").execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE profiles (id UUID PRIMARY KEY, preferences JSONB, is_banned BOOLEAN NOT NULL DEFAULT false, ban_reason TEXT)").execute(&pool).await.unwrap();
        let user = Uuid::new_v4();
        let other = Uuid::new_v4();
        sqlx::query("INSERT INTO profiles (id, preferences) VALUES ($1, '{}')").bind(user).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO auth.mfa_factors VALUES ($1, 'verified'), ($2, 'unverified')").bind(other).bind(user).execute(&pool).await.unwrap();

        assert!(required(&pool, user, Some("aal1"), "DELETE", "/api/stories/1").await.is_ok());
        assert_eq!(optional(&pool, user, Some("aal1")).await, Some(user));
        sqlx::query("UPDATE auth.mfa_factors SET status = 'verified' WHERE user_id = $1").bind(user).execute(&pool).await.unwrap();
        for aal in [None, Some("aal1")] {
            assert!(matches!(required(&pool, user, aal, "DELETE", "/api/stories/1").await, Err(AppError::Forbidden(_))));
            assert!(matches!(required(&pool, user, aal, "GET", "/api/profile").await, Err(AppError::Forbidden(_))));
            assert_eq!(optional(&pool, user, aal).await, None);
        }
        assert!(required(&pool, user, Some("aal2"), "DELETE", "/api/stories/1").await.is_ok());
        assert_eq!(optional(&pool, user, Some("aal2")).await, Some(user));
        sqlx::query("UPDATE profiles SET preferences = '{\"two_factor_email_enabled\": true}' WHERE id = $1").bind(user).execute(&pool).await.unwrap();
        assert!(matches!(required(&pool, user, Some("aal1"), "GET", "/api/profile").await, Err(AppError::Forbidden(_))));
        sqlx::query("DELETE FROM auth.mfa_factors WHERE user_id = $1").bind(user).execute(&pool).await.unwrap();
        assert!(required(&pool, user, Some("aal1"), "GET", "/api/profile").await.is_ok());
        assert!(matches!(required(&pool, user, Some("aal1"), "DELETE", "/api/stories/1").await, Err(AppError::Forbidden(_))));
        assert_eq!(optional(&pool, user, Some("aal1")).await, None);
        sqlx::query("DELETE FROM profiles WHERE id = $1").bind(user).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO auth.mfa_factors VALUES ($1, 'verified')").bind(user).execute(&pool).await.unwrap();
        assert!(matches!(required(&pool, user, Some("aal1"), "DELETE", "/api/stories/1").await, Err(AppError::Forbidden(_))));
        assert_eq!(optional(&pool, user, Some("aal1")).await, None);
        sqlx::query("ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY").execute(&pool).await.unwrap();
        sqlx::query("CREATE ROLE katha_mfa_test_reader NOLOGIN").execute(&pool).await.unwrap();
        sqlx::query("GRANT USAGE ON SCHEMA auth TO katha_mfa_test_reader").execute(&pool).await.unwrap();
        sqlx::query("GRANT SELECT ON profiles, auth.mfa_factors TO katha_mfa_test_reader").execute(&pool).await.unwrap();
        let restricted = PgPoolOptions::new().max_connections(1)
            .connect(&std::env::var("TEST_DATABASE_URL").unwrap()).await.unwrap();
        sqlx::query("SET ROLE katha_mfa_test_reader").execute(&restricted).await.unwrap();
        assert!(matches!(required(&restricted, user, Some("aal1"), "DELETE", "/api/stories/1").await, Err(AppError::InternalServerError(_))));
        assert_eq!(optional(&restricted, user, Some("aal1")).await, None);
        restricted.close().await;
        sqlx::query("DROP TABLE auth.mfa_factors").execute(&pool).await.unwrap();
        assert!(matches!(required(&pool, user, Some("aal1"), "DELETE", "/api/stories/1").await, Err(AppError::InternalServerError(_))));
        assert_eq!(optional(&pool, user, Some("aal1")).await, None);
    }
}
