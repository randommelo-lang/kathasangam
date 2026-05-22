use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
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

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // 1. Get the secret string from .env
        let env_secret = std::env::var("SUPABASE_JWT_SECRET").map_err(|e| {
            eprintln!("Missing SUPABASE_JWT_SECRET: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        // 2. Convert the literal "\n" text back into real newlines for the PEM parser
        let pem_key = env_secret.replace("\\n", "\n");

        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?;

        if !auth_header.starts_with("Bearer ") {
            return Err(StatusCode::UNAUTHORIZED);
        }

        let token = &auth_header[7..];

        // 3. Parse as an Elliptic Curve (EC) PEM key
        let decoding_key = DecodingKey::from_ec_pem(pem_key.as_bytes()).map_err(|e| {
            eprintln!("Failed to parse Public Key PEM: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        // 4. Set validation to expect ES256 (which matches your ECC P-256 key)
        let mut validation = Validation::new(Algorithm::ES256);
        validation.validate_aud = true;
        validation.set_audience(&["authenticated"]);

        let token_data = decode::<JwtClaims>(token, &decoding_key, &validation).map_err(|e| {
            eprintln!("JWT validation failed: {}", e);
            StatusCode::UNAUTHORIZED
        })?;

        let user_id = Uuid::parse_str(&token_data.claims.sub).map_err(|_| StatusCode::UNAUTHORIZED)?;

        Ok(AuthUser { user_id })
    }
}

pub async fn connect_db(database_url: &str) -> PgPool {
    PgPool::connect(database_url)
        .await
        .expect("Database connection failed")
}