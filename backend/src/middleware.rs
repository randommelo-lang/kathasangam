use axum::{
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub struct RateLimiter {
    requests: Mutex<HashMap<String, Vec<Instant>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            requests: Mutex::new(HashMap::new()),
        }
    }

    pub fn check(&self, key: String, max_requests: usize, window: Duration) -> bool {
        let mut reqs = self.requests.lock().unwrap();
        let now = Instant::now();
        let client_reqs = reqs.entry(key).or_insert_with(Vec::new);
        client_reqs.retain(|&t| {
            // Avoid underflow / panics in duration_since if system clock shifts slightly
            now > t && now.duration_since(t) < window
        });
        if client_reqs.len() >= max_requests {
            false
        } else {
            client_reqs.push(now);
            true
        }
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

    // Path-specific limits
    let path = request.uri().path();
    let (limit, window_secs) = if path.contains("/upload/image") {
        (30, 60) // Tight limit for image uploads: max 30 per minute
    } else {
        (100, 60) // General API limit: max 100 per minute
    };

    let ip_key = ip.clone();
    if !limiter.check(ip_key, limit, Duration::from_secs(window_secs)) {
        eprintln!("Rate limit exceeded for IP: {} on path: {}", ip, path);
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    Ok(next.run(request).await)
}
