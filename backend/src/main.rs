mod db;
mod models;
mod routes;
mod search;
mod middleware;
pub mod errors;


use axum::{
    routing::{get, patch, post, delete, put},
    Router,
};

use sqlx::postgres::PgPoolOptions;

use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    // Initialize structured logging / tracing
    let log_format = std::env::var("LOG_FORMAT").unwrap_or_default();
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    if log_format.to_lowercase() == "json" {
        tracing_subscriber::fmt()
            .with_env_filter(env_filter)
            .json()
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_env_filter(env_filter)
            .init();
    }

    // Initialize cached JWT public key
    crate::db::init_jwt_decoding_key();

    tracing::info!("🔶 KathaSangam Backend starting …");

    let rate_limiter = middleware::RateLimiter::new();


    let db_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL missing");

    let pool = PgPoolOptions::new()

        .max_connections(10)

        .connect(&db_url)

        .await

        .expect("Failed to connect to PostgreSQL");

    tracing::info!("✅ Connected to Supabase PostgreSQL");

    // Initialize Meilisearch index & backfill asynchronously
    let pool_clone = pool.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::search::init_search_index().await {
            tracing::error!("⚠️ Meilisearch initialization failed: {}", e);
        } else if let Err(e) = crate::search::backfill_all_stories(&pool_clone).await {
            tracing::error!("⚠️ Meilisearch backfill failed: {}", e);
        } else {
            tracing::info!("✅ Meilisearch search index synced & ready!");
        }
    });



    let api = Router::new()

        // STORIES
        .route(
            "/stories",
            get(routes::stories::list_stories)
                .post(routes::stories::create_story),
        )

        .route(
            "/stories/:id",
            get(routes::stories::get_story)
                .put(routes::stories::update_story)
                .delete(routes::stories::delete_story),
        )

        // STATS
        .route(
            "/stats",
            get(routes::stories::get_stats),
        )

        // CHAPTERS
        .route(
            "/stories/:story_id/chapters",
            get(routes::chapters::list_chapters)
                .post(routes::chapters::create_chapter),
        )

        .route(
            "/chapters/:chapter_id/status",
            patch(routes::chapters::toggle_chapter_status),
        )

        .route(
            "/chapters/:chapter_id",
            put(routes::chapters::update_chapter)
                .delete(routes::chapters::delete_chapter),
        )

        // COMMENTS
        .route(
            "/chapters/:story_id/:index/comments",
            get(routes::comments::list_comments)
                .post(routes::comments::create_comment),
        )
        .route(
            "/comments/:id",
            delete(routes::comments::delete_comment),
        )

        // LIBRARY
        .route(
            "/library",
            get(routes::library::get_library),
        )

        .route(
            "/library/ids",
            get(routes::library::get_library_ids),
        )

        .route(
            "/library/follow",
            post(routes::library::toggle_follow),
        )

        // TIPS
        .route(
            "/stories/:id/tip",
            post(routes::tips::tip_story),
        )

        // REPORTS
        .route(
            "/reports",
            get(routes::reports::list_reports)
                .post(routes::reports::create_report),
        )

        .route(
            "/reports/logs",
            get(routes::reports::list_audit_logs),
        )

        .route(
            "/reports/:id",
            patch(routes::reports::update_report),
        )

        // NOTIFICATIONS
        .route(
            "/notifications",
            get(routes::notifications::list_notifications)
                .delete(routes::notifications::clear_all_notifications),
        )
        .route(
            "/notifications/:id",
            delete(routes::notifications::delete_notification),
        )

        // PROGRESS
        .route(
            "/progress",
            get(routes::progress::get_progress)
                .post(routes::progress::update_progress),
        )

        // IMAGE UPLOAD
        .route(
            "/upload/image",
            post(routes::upload::upload_image)
                .layer(axum::extract::DefaultBodyLimit::max(5 * 1024 * 1024)),
        )


        // PROFILE
        .route(
            "/profile",
            get(routes::profile::get_profile)
                .put(routes::profile::update_profile)
                .delete(routes::profile::delete_profile),
        )
        .route(
            "/profile/role",
            patch(routes::profile::update_profile_role),
        )
        .route(
            "/profiles/:username",
            get(routes::profile::get_public_profile),
        )
        .route(
            "/profiles/check-username/:username",
            get(routes::profile::check_username),
        )

        // CONFIG (public Supabase config for frontend)
        .route(
            "/config",
            get(routes::config::get_config),
        )

        // HEALTH CHECK
        .route(
            "/health",
            get(routes::health::health_check),
        )
        .layer(axum::middleware::from_fn_with_state(
            rate_limiter.clone(),
            middleware::rate_limit_middleware,
        ));


    let uploads_service =
        ServeDir::new("uploads");

    let frontend_service =
        ServeDir::new("..")
            .append_index_html_on_directories(true);


    let app = Router::new()

        .nest("/api", api)

        .nest_service(
            "/uploads",
            uploads_service,
        )

        .fallback_service(frontend_service)

        .layer(axum::middleware::from_fn(middleware::request_tracing_middleware))

        .layer(CorsLayer::permissive())

        .with_state(pool);

    let addr = "0.0.0.0:3000";

    tracing::info!("🚀 Listening on http://localhost:3000");

    let listener =
        tokio::net::TcpListener::bind(addr)
            .await
            .unwrap();

    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())
        .await
        .unwrap();
}