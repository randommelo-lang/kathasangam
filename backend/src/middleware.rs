use axum::{
    extract::{ConnectInfo, Request, State},
    http::HeaderMap,
    middleware::Next,
    response::Response,
};
use tracing::{info_span, Instrument};

use crate::errors::AppError;
use governor::{clock::DefaultClock, state::keyed::DefaultKeyedStateStore, Quota, RateLimiter as GovRateLimiter};
use std::net::SocketAddr;
use std::num::NonZeroU32;
use std::sync::Arc;
use std::time::Duration;

pub struct RateLimiter {
    upload_limiter: GovRateLimiter<String, DefaultKeyedStateStore<String>, DefaultClock>,
    general_limiter: GovRateLimiter<String, DefaultKeyedStateStore<String>, DefaultClock>,
}

impl RateLimiter {
    pub fn new() -> Arc<Self> {
        let upload_quota = Quota::per_minute(NonZeroU32::new(30).unwrap());
        let general_quota = Quota::per_minute(NonZeroU32::new(100).unwrap());

        let limiter = Arc::new(Self {
            upload_limiter: GovRateLimiter::keyed(upload_quota),
            general_limiter: GovRateLimiter::keyed(general_quota),
        });

        // Spawn a background task to prune stale entries every 10 minutes (600 seconds)
        let limiter_clone = Arc::clone(&limiter);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(600)).await;
                limiter_clone.upload_limiter.retain_recent();
                limiter_clone.general_limiter.retain_recent();
            }
        });

        limiter
    }
}

pub async fn rate_limit_middleware(
    State(limiter): State<Arc<RateLimiter>>,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    // Resolve the real client IP (handling reverse proxies like Cloudflare or Railway)
    let ip = headers
        .get("cf-connecting-ip")
        .and_then(|h| h.to_str().ok())
        .or_else(|| {
            headers
                .get("x-forwarded-for")
                .and_then(|h| h.to_str().ok())
                .and_then(|h| h.split(',').next())
        })
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| addr.ip().to_string());

    let path = request.uri().path();

    // Check key against the appropriate limiter
    let allowed = if path.contains("/upload/image") {
        limiter.upload_limiter.check_key(&ip).is_ok()
    } else {
        limiter.general_limiter.check_key(&ip).is_ok()
    };

    if !allowed {
        tracing::warn!("Rate limit exceeded for IP: {} on path: {}", ip, path);
        return Err(AppError::too_many_requests("Too many requests. Please try again later."));
    }

    Ok(next.run(request).await)
}

pub async fn request_tracing_middleware(
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    let start = std::time::Instant::now();

    // Resolve request ID from header or generate new one
    let request_id = headers
        .get("x-request-id")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // Resolve client IP (taking proxies into account)
    let ip = headers
        .get("cf-connecting-ip")
        .and_then(|h| h.to_str().ok())
        .or_else(|| {
            headers
                .get("x-forwarded-for")
                .and_then(|h| h.to_str().ok())
                .and_then(|h| h.split(',').next())
        })
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| addr.ip().to_string());

    let method = request.method().clone();
    let path = request.uri().path().to_string();

    // Span for structured logging context
    let span = info_span!(
        "request",
        request_id = %request_id,
        method = %method.as_str(),
        path = %path,
        client_ip = %ip,
    );

    async move {
        let mut response = next.run(request).await;
        let latency = start.elapsed();
        let status = response.status();

        if let Ok(val) = axum::http::HeaderValue::from_str(&request_id) {
            response.headers_mut().insert("x-request-id", val);
        }

        tracing::info!(
            status = %status.as_u16(),
            latency_ms = %latency.as_millis(),
            "HTTP request processed"
        );

        response
    }
    .instrument(span)
    .await
}

pub async fn security_headers_middleware(
    request: Request,
    next: Next,
) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();

    let csp_val = "default-src 'self'; \
                   script-src 'self'; \
                   style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; \
                   font-src 'self' https://fonts.gstatic.com; \
                   img-src 'self' data: https://*.supabase.co https:; \
                   connect-src 'self' https://*.supabase.co; \
                   worker-src 'self' blob:; \
                   child-src 'self' blob:; \
                   frame-ancestors 'none';";

    if let Ok(val) = axum::http::HeaderValue::from_str(csp_val) {
        headers.insert(axum::http::header::CONTENT_SECURITY_POLICY, val);
    }

    if let Ok(val) = axum::http::HeaderValue::from_str("nosniff") {
        headers.insert(axum::http::header::X_CONTENT_TYPE_OPTIONS, val);
    }

    if let Ok(val) = axum::http::HeaderValue::from_str("DENY") {
        headers.insert(axum::http::header::X_FRAME_OPTIONS, val);
    }

    if let Ok(val) = axum::http::HeaderValue::from_str("strict-origin-when-cross-origin") {
        headers.insert(axum::http::header::REFERRER_POLICY, val);
    }

    response
}


