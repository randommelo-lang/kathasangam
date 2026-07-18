mod db;
mod models;
mod routes;
mod search;
mod middleware;
pub mod errors;

use std::io;

use axum::{
    routing::{get, patch, post, delete, put},
    Router,
};

use sqlx::postgres::PgPoolOptions;

use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
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
    crate::db::init_jwt_decoding_key()?;

    tracing::info!("🔶 KathaSangam Backend starting …");

    let rate_limiter = middleware::RateLimiter::new();


    let db_url = std::env::var("DATABASE_URL")?;

    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&db_url)

        .await
        .map_err(|e| io::Error::other(format!("Failed to connect to PostgreSQL: {}", e)))?;

    tracing::info!("✅ Connected to Supabase PostgreSQL");

    // Run pending migrations
    tracing::info!("🔶 Running database migrations...");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| io::Error::other(format!("Database migration failed: {}", e)))?;
    tracing::info!("✅ Database migrations completed");

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

    // Auto-publisher: checks every 60 seconds for scheduled chapters
    let publish_pool = pool.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            let rows: Vec<(uuid::Uuid, uuid::Uuid, String, i32)> = match sqlx::query_as(
                "SELECT id, story_id, title, sort_order FROM chapters WHERE status = 'scheduled' AND scheduled_at <= NOW()"
            )
            .fetch_all(&publish_pool)
            .await {
                Ok(r) => r,
                Err(e) => {
                    tracing::error!("Auto-publisher query failed: {:?}", e);
                    continue;
                }
            };

            for (ch_id, story_id, title, sort_order) in &rows {
                if let Err(e) = sqlx::query("UPDATE chapters SET status = 'published', scheduled_at = NULL WHERE id = $1")
                    .bind(ch_id)
                    .execute(&publish_pool)
                    .await
                {
                    tracing::error!("Auto-publisher failed to publish chapter {}: {:?}", ch_id, e);
                    continue;
                }

                tracing::info!("📅 Auto-published chapter '{}' (id: {})", title, ch_id);

                // Notify followers
                let story_info: Option<(String,)> = sqlx::query_as("SELECT title FROM stories WHERE id = $1")
                    .bind(story_id)
                    .fetch_optional(&publish_pool)
                    .await
                    .unwrap_or(None);

                let story_title = story_info.map(|s| s.0).unwrap_or_else(|| "a followed story".to_string());
                let message = format!("New chapter '{}' published for '{}'", title, story_title);

                let _ = sqlx::query(
                    "INSERT INTO notifications (user_id, message, story_id, chapter_sort_order) \
                     SELECT l.user_id, $1, $2, $3 \
                     FROM library l \
                     JOIN profiles p ON l.user_id = p.id \
                     WHERE l.story_id = $2 AND (COALESCE(p.preferences->>'in_app_notifications', 'true'))::boolean = true"
                )
                .bind(&message)
                .bind(story_id)
                .bind(sort_order)
                .execute(&publish_pool)
                .await;
            }
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
        .route(
            "/stories/:id/like",
            post(routes::stories::like_story),
        )
        .route(
            "/stories/:id/liked",
            get(routes::stories::check_liked),
        )
        .route(
            "/stories/:id/view",
            post(routes::stories::view_story),
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
            "/chapters/scheduled",
            get(routes::chapters::list_scheduled_chapters),
        )
        .route(
            "/chapters/:chapter_id",
            put(routes::chapters::update_chapter)
                .delete(routes::chapters::delete_chapter),
        )
        // COLLABORATORS
        .route(
            "/stories/:story_id/collaborators",
            get(routes::collaborators::list_collaborators)
                .post(routes::collaborators::invite_collaborator),
        )
        .route(
            "/stories/:story_id/collaborators/:user_id",
            delete(routes::collaborators::remove_collaborator),
        )
        .route(
            "/collaborations/invites",
            get(routes::collaborators::list_my_invites),
        )
        .route(
            "/collaborations/invites/:invite_id/respond",
            post(routes::collaborators::respond_invite),
        )

        // INTERNAL NOTES
        .route(
            "/stories/:story_id/internal-notes",
            get(routes::internal_notes::list_internal_notes)
                .post(routes::internal_notes::create_internal_note),
        )
        .route(
            "/stories/:story_id/internal-notes/:note_id",
            delete(routes::internal_notes::delete_internal_note),
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
            "/reports/bulk",
            post(routes::reports::bulk_update_reports),
        )

        .route(
            "/reports/logs/moderators",
            get(routes::reports::list_log_moderators),
        )
        .route(
            "/reports/logs",
            get(routes::reports::list_audit_logs),
        )

        .route(
            "/reports/:id",
            patch(routes::reports::update_report),
        )
        .route(
            "/reports/:id/severity",
            patch(routes::reports::update_report_severity),
        )
        .route(
            "/moderation/ban",
            post(routes::reports::ban_user),
        )
        .route(
            "/moderation/scan",
            post(routes::reports::run_text_scan),
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

        // DIRECT MESSAGES
        .route(
            "/messages",
            get(routes::messages::list_conversations)
                .post(routes::messages::send_message),
        )
        .route(
            "/messages/:user_id",
            get(routes::messages::get_message_history),
        )

        // BOOKMARKS
        .route(
            "/bookmarks",
            get(routes::bookmarks::list_bookmarks)
                .post(routes::bookmarks::toggle_bookmark),
        )
        .route(
            "/bookmarks/ids",
            get(routes::bookmarks::get_bookmark_ids),
        )

        // READING LISTS
        .route(
            "/reading-lists",
            get(routes::reading_lists::list_reading_lists)
                .post(routes::reading_lists::create_reading_list),
        )
        .route(
            "/reading-lists/:id",
            get(routes::reading_lists::get_reading_list)
                .delete(routes::reading_lists::delete_reading_list),
        )
        .route(
            "/reading-lists/:id/entries",
            post(routes::reading_lists::add_story_to_reading_list),
        )
        .route(
            "/reading-lists/:id/entries/:story_id",
            delete(routes::reading_lists::remove_story_from_reading_list),
        )

        // IMAGE UPLOAD
        .route(
            "/upload/image",
            post(routes::upload::upload_image)
                .layer(axum::extract::DefaultBodyLimit::disable()),
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
        .route(
            "/follow/user/:id",
            post(routes::profile::toggle_follow_user),
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


    let allowed_origins_env = std::env::var("ALLOWED_ORIGINS").ok();

    // Configure strict/allowlist CORS policy
    let cors_layer = {
        let base_cors = CorsLayer::new()
            .allow_methods([
                axum::http::Method::GET,
                axum::http::Method::POST,
                axum::http::Method::PUT,
                axum::http::Method::PATCH,
                axum::http::Method::DELETE,
                axum::http::Method::OPTIONS,
            ])
            .allow_headers([
                axum::http::header::AUTHORIZATION,
                axum::http::header::CONTENT_TYPE,
            ])
            .allow_credentials(true);

        if let Some(origins_str) = allowed_origins_env {
            let origins: Vec<String> = origins_str
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();

            base_cors.allow_origin(tower_http::cors::AllowOrigin::predicate(
                move |origin: &axum::http::HeaderValue, _request_parts: &axum::http::request::Parts| {
                    if let Ok(origin_str) = origin.to_str() {
                        // 1. Check exact match in ALLOWED_ORIGINS
                        if origins.iter().any(|o| o == origin_str) {
                            return true;
                        }
                        // 2. Allow local loopback origins
                        if origin_str.starts_with("http://localhost:") || origin_str.starts_with("http://127.0.0.1:") {
                            return true;
                        }
                        // 3. Allow Vercel preview domains
                        if origin_str.ends_with(".vercel.app") {
                            return true;
                        }
                    }
                    false
                }
            ))
        } else {
            // Default allowed origins if ALLOWED_ORIGINS env is not configured
            base_cors.allow_origin(tower_http::cors::AllowOrigin::predicate(
                move |origin: &axum::http::HeaderValue, _request_parts: &axum::http::request::Parts| {
                    if let Ok(origin_str) = origin.to_str() {
                        if origin_str.starts_with("http://localhost:") || origin_str.starts_with("http://127.0.0.1:") || origin_str.ends_with(".vercel.app") {
                            return true;
                        }
                    }
                    false
                }
            ))
        }
    };

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

        .layer(axum::middleware::from_fn(middleware::security_headers_middleware))

        .layer(axum::middleware::from_fn(middleware::request_tracing_middleware))

        .layer(cors_layer)

        .with_state(pool);

    let addr = "0.0.0.0:3000";

    tracing::info!("🚀 Listening on http://localhost:3000");

    let listener =
        tokio::net::TcpListener::bind(addr)
            .await?;

    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())
        .await?;

    Ok(())
}
