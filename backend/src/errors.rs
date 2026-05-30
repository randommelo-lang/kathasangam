use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    NotFound(String),
    Unauthorized(String),
    Forbidden(String),
    BadRequest(String),
    InternalServerError(String),
    TooManyRequests(String),
}

#[derive(Serialize)]
struct ErrorPayload {
    error: &'static str,
    message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_code, message) = match self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, "not_found", msg),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, "unauthorized", msg),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, "forbidden", msg),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "bad_request", msg),
            AppError::InternalServerError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_server_error", msg),
            AppError::TooManyRequests(msg) => (StatusCode::TOO_MANY_REQUESTS, "too_many_requests", msg),
        };

        let body = Json(ErrorPayload {
            error: error_code,
            message,
        });

        (status, body).into_response()
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::NotFound(m) => write!(f, "Not Found: {}", m),
            AppError::Unauthorized(m) => write!(f, "Unauthorized: {}", m),
            AppError::Forbidden(m) => write!(f, "Forbidden: {}", m),
            AppError::BadRequest(m) => write!(f, "Bad Request: {}", m),
            AppError::InternalServerError(m) => write!(f, "Internal Server Error: {}", m),
            AppError::TooManyRequests(m) => write!(f, "Too Many Requests: {}", m),
        }
    }
}

impl std::error::Error for AppError {}

impl AppError {
    pub fn unauthorized<T: Into<String>>(msg: T) -> Self {
        AppError::Unauthorized(msg.into())
    }

    pub fn not_found<T: Into<String>>(msg: T) -> Self {
        AppError::NotFound(msg.into())
    }

    pub fn forbidden<T: Into<String>>(msg: T) -> Self {
        AppError::Forbidden(msg.into())
    }

    pub fn bad_request<T: Into<String>>(msg: T) -> Self {
        AppError::BadRequest(msg.into())
    }

    pub fn internal_server_error<T: Into<String>>(msg: T) -> Self {
        AppError::InternalServerError(msg.into())
    }

    pub fn too_many_requests<T: Into<String>>(msg: T) -> Self {
        AppError::TooManyRequests(msg.into())
    }
}

// Convert from sqlx::Error
impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::InternalServerError(err.to_string())
    }
}

// Convert from std::io::Error
impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::InternalServerError(err.to_string())
    }
}

// Convert from jsonwebtoken::errors::Error
impl From<jsonwebtoken::errors::Error> for AppError {
    fn from(err: jsonwebtoken::errors::Error) -> Self {
        AppError::Unauthorized(err.to_string())
    }
}

// Convert from uuid::Error (useful for parsing ID parameters)
impl From<uuid::Error> for AppError {
    fn from(err: uuid::Error) -> Self {
        AppError::BadRequest(err.to_string())
    }
}
