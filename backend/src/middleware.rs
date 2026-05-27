use axum::{
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
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
) -> Result<Response, StatusCode> {
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
        eprintln!("Rate limit exceeded for IP: {} on path: {}", ip, path);
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    Ok(next.run(request).await)
}
