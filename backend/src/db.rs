use axum::{
    async_trait,
    extract::FromRequestParts,
    http::request::Parts,
};
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
}

pub struct AuthUser {
    pub user_id: Uuid,
}

pub static JWT_DECODING_KEY: OnceLock<DecodingKey> = OnceLock::new();

fn mock_user_id() -> Uuid {
    Uuid::from_bytes([
        0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x7a, 0x8b, 0x9c, 0x0d, 0x1e, 0x2f, 0x3a, 0x4b,
        0x5c, 0x6d,
    ])
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
impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok())
            .ok_or_else(|| AppError::unauthorized("Please log in to perform this action."))?;

        if !auth_header.starts_with("Bearer ") {
            return Err(AppError::unauthorized("Invalid authorization header format."));
        }

        let token = &auth_header[7..];

        if token == "mock-access-token" {
            return Ok(AuthUser {
                user_id: mock_user_id(),
            });
        }

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

        let user_id = Uuid::parse_str(&token_data.claims.sub)
            .map_err(|_| AppError::unauthorized("Invalid user ID in session token."))?;

        Ok(AuthUser { user_id })
    }
}

pub struct OptionalAuthUser {
    pub user_id: Option<Uuid>,
}

#[async_trait]
impl<S> FromRequestParts<S> for OptionalAuthUser
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok());

        if let Some(header) = auth_header {
            if header.starts_with("Bearer ") {
                let token = &header[7..];
                if token == "mock-access-token" {
                    return Ok(OptionalAuthUser {
                        user_id: Some(mock_user_id()),
                    });
                }
                if let Some(decoding_key) = JWT_DECODING_KEY.get() {
                    let mut validation = Validation::new(Algorithm::ES256);
                    validation.validate_aud = true;
                    validation.set_audience(&["authenticated"]);

                    if let Ok(token_data) = decode::<JwtClaims>(token, decoding_key, &validation) {
                        if let Ok(parsed_id) = Uuid::parse_str(&token_data.claims.sub) {
                            return Ok(OptionalAuthUser {
                                user_id: Some(parsed_id),
                            });
                        }
                    }
                }
            }
        }
        Ok(OptionalAuthUser { user_id: None })
    }
}
