use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
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

pub fn init_jwt_decoding_key() {
    let env_secret = std::env::var("SUPABASE_JWT_SECRET").expect("SUPABASE_JWT_SECRET is missing");
    let pem_key = env_secret.replace("\\n", "\n");
    let key = DecodingKey::from_ec_pem(pem_key.as_bytes()).expect("Failed to parse SUPABASE_JWT_SECRET as EC PEM key");
    if JWT_DECODING_KEY.set(key).is_err() {
        panic!("Failed to set JWT_DECODING_KEY OnceLock");
    }
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?;

        if !auth_header.starts_with("Bearer ") {
            return Err(StatusCode::UNAUTHORIZED);
        }

        let token = &auth_header[7..];

        let decoding_key = JWT_DECODING_KEY.get().ok_or_else(|| {
            eprintln!("JWT decoding key is not initialized");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        // Set validation to expect ES256 (which matches your ECC P-256 key)
        let mut validation = Validation::new(Algorithm::ES256);
        validation.validate_aud = true;
        validation.set_audience(&["authenticated"]);

        let token_data = decode::<JwtClaims>(token, decoding_key, &validation).map_err(|e| {
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