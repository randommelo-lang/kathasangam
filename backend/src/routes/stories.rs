use std::collections::HashMap;

use axum::{
    extract::{Path, Query, State, ConnectInfo},
    http::{StatusCode, HeaderMap},
    Json,
};
use std::net::SocketAddr;
use sqlx::PgPool;
use uuid::Uuid;
use chrono::Datelike;

use crate::db::{AuthUser, OptionalAuthUser};
use crate::models::*;
use crate::errors::AppError;

const STORY_SELECT_BY_ID: &str = "SELECT stories.id, stories.author_id, COALESCE(profiles.username, 'You') AS author_name, stories.title, stories.type, stories.genre, stories.language, stories.license, stories.status, stories.tags, stories.description, stories.cover, stories.followers, stories.views, stories.likes, stories.earnings, stories.progress, stories.created_at, stories.is_nsfw, COALESCE(stories.content_rating, 'All ages') AS content_rating FROM stories LEFT JOIN profiles ON profiles.id = stories.author_id WHERE stories.id = $1";

pub const CANONICAL_GENRES: &[&str] = &[
    "Fantasy",
    "Romance",
    "Sci-Fi",
    "Action",
    "Drama",
    "Mystery",
    "Slice of Life",
    "Supernatural",
    "Historical",
    "Poetry",
    "Comedy",
    "Horror",
    "Thriller",
    "Adventure",
];

pub fn normalize_genre(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "Fantasy".to_string();
    }
    for canonical in CANONICAL_GENRES {
        if trimmed.eq_ignore_ascii_case(canonical) {
            return canonical.to_string();
        }
    }
    trimmed
        .split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn is_chitrank(raw: &str) -> bool {
    let trimmed = raw.trim();
    trimmed.eq_ignore_ascii_case("chitrānk") || trimmed.eq_ignore_ascii_case("chitrank")
}

pub fn normalize_story_type(raw: &str) -> String {
    if is_chitrank(raw) {
        "Chitrānk".to_string()
    } else {
        "Web Novel".to_string()
    }
}

pub fn normalize_language(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "English".to_string();
    }
    match trimmed.to_ascii_lowercase().as_str() {
        "en" | "eng" | "english" => "English".to_string(),
        "ne" | "nep" | "nepali" => "Nepali".to_string(),
        "hi" | "hin" | "hindi" => "Hindi".to_string(),
        _ => {
            let mut chars = trimmed.chars();
            match chars.next() {
                None => "English".to_string(),
                Some(first) => first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
            }
        }
    }
}

pub fn normalize_status(raw: &str) -> String {
    let trimmed = raw.trim();
    match trimmed.to_ascii_lowercase().as_str() {
        "ongoing" | "active" => "ongoing".to_string(),
        "completed" | "complete" => "completed".to_string(),
        "on_hold" | "on hold" | "hiatus" => "on_hold".to_string(),
        "cancelled" | "canceled" => "cancelled".to_string(),
        "draft" | "unpublished" => "draft".to_string(),
        _ => trimmed.to_lowercase(),
    }
}

pub fn normalize_tags(tags: &[String], is_promoted: bool) -> Vec<String> {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();

    if is_promoted {
        result.push("promoted".to_string());
        seen.insert("promoted".to_string());
    }

    for tag in tags {
        let cleaned = tag.trim().trim_start_matches('#').to_lowercase();
        if !cleaned.is_empty() && cleaned.chars().count() <= 30 && !seen.contains(&cleaned) {
            seen.insert(cleaned.clone());
            result.push(cleaned);
        }
    }
    result
}

pub async fn is_user_eighteen_plus(pool: &PgPool, user_id: uuid::Uuid) -> bool {
    let row: Option<(Option<serde_json::Value>,)> = sqlx::query_as(
        "SELECT preferences FROM profiles WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    if let Some((Some(prefs),)) = row {
        if let Some(dob_val) = prefs.get("date_of_birth") {
            if let Some(dob_str) = dob_val.as_str() {
                if let Ok(dob) = chrono::NaiveDate::parse_from_str(dob_str, "%Y-%m-%d") {
                    let today = chrono::Utc::now().naive_utc().date();
                    let mut age = today.year() - dob.year();
                    if today.month() < dob.month() || (today.month() == dob.month() && today.day() < dob.day()) {
                        age -= 1;
                    }
                    return age >= 18;
                }
            }
        }
    }
    false
}

pub async fn get_user_nsfw_preference(pool: &PgPool, user_id: uuid::Uuid) -> String {
    let row: Option<(Option<serde_json::Value>,)> = sqlx::query_as(
        "SELECT preferences FROM profiles WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    if let Some((Some(prefs),)) = row {
        if let Some(pref_val) = prefs.get("nsfw_preference") {
            if let Some(pref_str) = pref_val.as_str() {
                return pref_str.to_string();
            }
        }
    }
    "blur".to_string()
}

const MAX_TITLE_LENGTH: usize = 120;
const MAX_DESCRIPTION_LENGTH: usize = 2_000;
const MAX_TAG_LENGTH: usize = 30;
const MAX_STORY_TAGS: usize = 20;

/// SB-18: most user-supplied strings had no length bound at all — only comments did.
/// This rejects control characters and over-long values before they reach the database,
/// which bounds storage growth and keeps list responses from ballooning.
fn validate_story_text<'a>(value: &'a str, label: &'static str) -> Result<&'a str, String> {
    let limit = match label {
        "Title" => MAX_TITLE_LENGTH,
        "Description" => MAX_DESCRIPTION_LENGTH,
        "Tag" => MAX_TAG_LENGTH,
        _ => MAX_TITLE_LENGTH,
    };

    if value.chars().any(char::is_control) {
        return Err(format!("{label} must not contain control characters."));
    }
    if value.chars().count() > limit {
        return Err(format!("{label} must be {limit} characters or fewer."));
    }
    Ok(value)
}

pub async fn fetch_story_row(pool: &PgPool, id: Uuid) -> Result<Option<StoryRow>, sqlx::Error> {
    sqlx::query_as(STORY_SELECT_BY_ID)
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// GET /api/stories?q=&genre=&type=&cursor=&limit=
pub async fn list_stories(
    // SB-05: was `auth: Option<AuthUser>`. Axum's blanket `Option<T>` extractor is
    // `T::from_request_parts(..).await.ok()`, which discards *every* rejection — so a
    // banned user (rejected by AuthUser with 403) was silently treated as anonymous
    // instead of being refused, and any transient DB fault during the ban check did
    // the same. `OptionalAuthUser` is the correct shape: it returns Ok(None) for a
    // banned user and Infallible, with no error-swallowing.
    auth: OptionalAuthUser,
    State(pool): State<PgPool>,
    Query(params): Query<StoryQuery>,
) -> Result<Json<StoryPage>, AppError> {
    let query = params.q.as_deref().unwrap_or("").trim();
    if query.chars().count() > 200 {
        return Err(AppError::bad_request("Search text must be 200 characters or fewer."));
    }
    for (name, value) in [("genre", params.genre.as_deref()), ("type", params.story_type.as_deref()), ("status", params.status.as_deref()), ("language", params.language.as_deref())] {
        if value.map(|v| v.chars().count() > 80 || v.chars().any(char::is_control)).unwrap_or(false) {
            return Err(AppError::bad_request(format!("The {name} filter is invalid or too long.")));
        }
    }
    if let Some(value) = params.story_type.as_deref().map(str::trim).filter(|v| !v.is_empty() && !v.eq_ignore_ascii_case("all")) {
        if !["web novel", "chitrānk", "chitrank"].iter().any(|valid| value.eq_ignore_ascii_case(valid)) {
            return Err(AppError::bad_request("type must be Web Novel or Chitrānk."));
        }
    }
    if let Some(value) = params.status.as_deref().map(str::trim).filter(|v| !v.is_empty() && !v.eq_ignore_ascii_case("all")) {
        if !["published", "ongoing", "active", "completed", "draft", "unpublished", "on_hold", "cancelled"].iter().any(|valid| value.eq_ignore_ascii_case(valid)) {
            return Err(AppError::bad_request("The selected status filter is not supported."));
        }
    }
    let sort = params
        .sort_by
        .as_deref()
        .map(str::to_ascii_lowercase)
        .unwrap_or_else(|| {
            if !query.is_empty() {
                "relevance".to_string()
            } else {
                "newest".to_string()
            }
        });
    let sanitized_query = query.replace('\'', "''");
    let relevance_calc = format!(
        "(CASE WHEN lower(stories.title) = lower('{q}') THEN 100 \
               WHEN lower(stories.title) LIKE lower('{q}') || '%' THEN 60 \
               WHEN lower(stories.title) LIKE '%' || lower('{q}') || '%' THEN 30 \
               ELSE 0 END \
         + CASE WHEN lower(stories.tags::text) LIKE '%' || lower('{q}') || '%' THEN 20 ELSE 0 END \
         + CASE WHEN lower(stories.genre) LIKE '%' || lower('{q}') || '%' THEN 15 ELSE 0 END \
         + CASE WHEN lower(stories.description) LIKE '%' || lower('{q}') || '%' THEN 5 ELSE 0 END)",
        q = sanitized_query
    );
    let sort_expression = match sort.as_str() {
        "newest" => "stories.created_at".to_string(),
        "reads" => "stories.views".to_string(),
        "likes" => "stories.likes".to_string(),
        "rating" => "COALESCE((SELECT AVG(rating)::float8 FROM story_ratings WHERE story_ratings.story_id = stories.id), 0.0)".to_string(),
        "relevance" => {
            if !query.is_empty() {
                relevance_calc
            } else {
                "stories.created_at".to_string()
            }
        }
        _ => return Err(AppError::bad_request("sort_by must be newest, reads, likes, rating, or relevance.")),
    };
    let limit = params.limit.unwrap_or(24);
    if !(1..=100).contains(&limit) {
        return Err(AppError::bad_request("limit must be between 1 and 100."));
    }

    let cursor_id = if let Some(cursor) = params.cursor.as_deref() {
        let mut parts = cursor.splitn(2, ':');
        let cursor_sort = parts.next().unwrap_or_default();
        let id = parts.next().ok_or_else(|| AppError::bad_request("Invalid cursor."))?;
        if cursor_sort != sort { return Err(AppError::bad_request("Cursor does not match the selected sort order.")); }
        Some(Uuid::parse_str(id).map_err(|_| AppError::bad_request("Invalid cursor."))?)
    } else { None };

    let mut sql = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        "SELECT stories.id, stories.author_id, COALESCE(profiles.username, 'You') AS author_name, stories.title, stories.type, stories.genre, stories.language, stories.license, stories.status, stories.tags, stories.description, stories.cover, stories.followers, stories.views, stories.likes, stories.earnings, stories.progress, stories.created_at, stories.is_nsfw, COALESCE(stories.content_rating, 'All ages') AS content_rating FROM stories LEFT JOIN profiles ON profiles.id = stories.author_id WHERE TRUE"
    );
    if !query.is_empty() {
        let pattern = format!("%{query}%");
        sql.push(" AND (stories.title ILIKE ").push_bind(pattern.clone())
            .push(" OR COALESCE(profiles.username, 'You') ILIKE ").push_bind(pattern.clone())
            .push(" OR stories.description ILIKE ").push_bind(pattern.clone())
            .push(" OR stories.genre ILIKE ").push_bind(pattern.clone())
            .push(" OR stories.tags::text ILIKE ").push_bind(pattern).push(")");
    }
    if let Some(value) = params.genre.as_deref().map(str::trim).filter(|v| !v.is_empty() && !v.eq_ignore_ascii_case("all")) {
        sql.push(" AND (',' || lower(stories.genre) || ',') LIKE ").push_bind(format!("%,{},%", value.to_lowercase()));
    }
    if let Some(value) = params.story_type.as_deref().map(str::trim).filter(|v| !v.is_empty() && !v.eq_ignore_ascii_case("all")) {
        if is_chitrank(value) {
            sql.push(" AND lower(stories.type) IN ('chitrānk', 'chitrank')");
        } else {
            sql.push(" AND lower(stories.type) = ").push_bind(value.to_lowercase());
        }
    }
    if let Some(value) = params.status.as_deref().map(str::trim).filter(|v| !v.is_empty() && !v.eq_ignore_ascii_case("all")) {
        let norm_status = normalize_status(value);
        if norm_status == "ongoing" {
            sql.push(" AND lower(stories.status) IN ('ongoing', 'active')");
        } else {
            sql.push(" AND lower(stories.status) = ").push_bind(norm_status);
        }
    }
    if let Some(value) = params.language.as_deref().map(str::trim).filter(|v| !v.is_empty() && !v.eq_ignore_ascii_case("all")) {
        let norm_lang = normalize_language(value);
        sql.push(" AND (lower(stories.language) = ").push_bind(norm_lang.to_lowercase())
            .push(" OR lower(stories.language) = ").push_bind(value.to_lowercase()).push(")");
    }
    if let Some(recency_val) = params.recency.as_deref().map(str::trim).filter(|v| !v.is_empty() && !v.eq_ignore_ascii_case("all")) {
        let days = match recency_val.to_ascii_lowercase().as_str() {
            "7d" | "week" => 7,
            "30d" | "month" => 30,
            "90d" | "quarter" => 90,
            "1y" | "year" => 365,
            _ => return Err(AppError::bad_request("recency must be 7d, 30d, 90d, 1y, or all.")),
        };
        sql.push(format!(
            " AND GREATEST(stories.created_at, COALESCE((SELECT MAX(created_at) FROM chapters WHERE chapters.story_id = stories.id AND chapters.status = 'published'), stories.created_at)) >= NOW() - INTERVAL '{days} days'"
        ));
    }
    // Visibility check in SQL (F-020): Only return published stories or stories the user can view
    match auth.user_id {
        Some(uid) => {
            sql.push(" AND (lower(stories.status) NOT IN ('draft', 'unpublished') \
                      OR EXISTS (SELECT 1 FROM chapters WHERE chapters.story_id = stories.id AND chapters.status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= NOW())) \
                      OR stories.author_id = ").push_bind(uid)
               .push(" OR EXISTS (SELECT 1 FROM story_collaborators sc WHERE sc.story_id = stories.id AND sc.user_id = ")
               .push_bind(uid)
               .push(" AND sc.status = 'accepted'))");
        }
        None => {
            sql.push(" AND (lower(stories.status) NOT IN ('draft', 'unpublished') \
                      OR EXISTS (SELECT 1 FROM chapters WHERE chapters.story_id = stories.id AND chapters.status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= NOW())))");
        }
    }

    if let Some(cursor_id) = cursor_id {
        // Tie-break by UUID so records with equal sort values are never skipped.
        sql.push(" AND ((").push(&sort_expression).push(" < (SELECT ").push(&sort_expression)
            .push(" FROM stories WHERE id = ").push_bind(cursor_id).push(") ) OR ((")
            .push(&sort_expression).push(" = (SELECT ").push(&sort_expression).push(" FROM stories WHERE id = ")
            .push_bind(cursor_id).push(") ) AND stories.id > ").push_bind(cursor_id).push("))");
    }
    sql.push(" ORDER BY ").push(&sort_expression).push(" DESC, stories.id ASC LIMIT ").push_bind(limit + 1);
    let mut rows = sql.build_query_as::<StoryRow>().fetch_all(&pool).await?;
    let has_more = rows.len() > limit as usize;
    rows.truncate(limit as usize);
    let mut results = build_story_metadata_responses_batch(&pool, &rows, auth.user_id).await?;
    let raw_genres = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT trim(genre_item) FROM stories \
         CROSS JOIN LATERAL unnest(string_to_array(stories.genre, ',')) AS genre_item \
         WHERE trim(genre_item) <> '' \
           AND (lower(stories.status) NOT IN ('draft', 'unpublished') \
                OR EXISTS (SELECT 1 FROM chapters WHERE chapters.story_id = stories.id AND chapters.status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= NOW()))) \
         ORDER BY trim(genre_item)"
    ).fetch_all(&pool).await?;
    let genres = raw_genres
        .into_iter()
        .map(|g| normalize_genre(&g))
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    let raw_languages = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT trim(stories.language) FROM stories \
         WHERE trim(stories.language) <> '' \
           AND (lower(stories.status) NOT IN ('draft', 'unpublished') \
                OR EXISTS (SELECT 1 FROM chapters WHERE chapters.story_id = stories.id AND chapters.status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= NOW()))) \
         ORDER BY trim(stories.language)"
    ).fetch_all(&pool).await?;
    let languages = raw_languages
        .into_iter()
        .map(|l| normalize_language(&l))
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    let (is_eighteen_plus, nsfw_pref) = match auth.user_id {
        Some(uid) => {
            let is_18 = is_user_eighteen_plus(&pool, uid).await;
            let pref = get_user_nsfw_preference(&pool, uid).await;
            (is_18, pref)
        }
        None => (false, "hide".to_string()),
    };

    results.retain(|s| {
        if s.is_nsfw {
            let is_author = auth.user_id.map(|uid| s.author_id == Some(uid) || s.collaborators.iter().any(|c| c.user_id == uid && c.status == "accepted")).unwrap_or(false);
            is_author || (is_eighteen_plus && nsfw_pref != "hide")
        } else {
            true
        }
    });

    // Visibility check: a story is publicly visible if its status is non-draft OR if it has at least 1 published chapter
    results.retain(|s| {
        let st = s.status.to_lowercase();
        if st != "draft" && st != "unpublished" {
            return true;
        }
        if s.chapters.iter().any(|ch| ch.status == "published") {
            return true;
        }
        if let Some(uid) = auth.user_id {
            if s.author_id == Some(uid) {
                return true;
            }
            if s.collaborators.iter().any(|c| c.user_id == uid && c.status == "accepted") {
                return true;
            }
        }
        false
    });

    // Apply the same visibility/NSFW rules as before, after building each bounded page.
    let last_id = results.last().map(|s| s.id);
    let is_empty = results.is_empty();
    let has_more = has_more && !is_empty;
    let next_cursor = if has_more { last_id.map(|id| format!("{sort}:{id}")) } else { None };
    Ok(Json(StoryPage { items: results, genres, languages, next_cursor, has_more }))
}

/// GET /api/stories/:id
pub async fn get_story(
    // SB-05: was `Option<AuthUser>`, which swallowed the banned-user rejection.
    auth: OptionalAuthUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<StoryResponse>, AppError> {
    let row: StoryRow = fetch_story_row(&pool, id)
        .await?
        .ok_or_else(|| AppError::not_found("Story not found."))?;

    let is_collab = if let Some(uid) = auth.user_id {
        crate::routes::collaborators::check_collaborator_access(&pool, uid, row.id).await.unwrap_or(false)
    } else {
        false
    };
    let is_member = auth.user_id.map(|uid| row.author_id == Some(uid) || is_collab).unwrap_or(false);

    // Draft visibility
    let status = row.status.to_lowercase();
    if (status == "draft" || status == "unpublished") && !is_member {
        return Err(AppError::forbidden("You do not have permission to view this story."));
    }

    // Check NSFW visibility
    if row.is_nsfw && !is_member {
        let mut allowed = false;
        if let Some(uid) = auth.user_id {
            if is_user_eighteen_plus(&pool, uid).await && get_user_nsfw_preference(&pool, uid).await != "hide" {
                allowed = true;
            }
        }
        if !allowed {
            return Err(AppError::forbidden("Underage or unauthenticated accounts are not permitted to view NSFW content."));
        }
    }

    let resp = build_story_response(&pool, &row, auth.user_id).await?;
    Ok(Json(resp))
}

/// DELETE /api/stories/:id
pub async fn delete_story(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<DeleteQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Check if the story exists and retrieve its author_id
    let row = fetch_story_row(&pool, id)
        .await?
        .ok_or_else(|| AppError::not_found("Story not found."))?;

    // Fetch the user's role from profiles
    let (user_role,): (String,) = sqlx::query_as("SELECT role::text FROM profiles WHERE id = $1")
        .bind(auth.user_id)
        .fetch_one(&pool)
        .await?;

    // Allow deleting only if the user is the author OR if they are an admin or moderator
    if row.author_id != Some(auth.user_id) && user_role != "admin" && user_role != "moderator" {
        return Err(AppError::forbidden("You do not have permission to delete this story."));
    }

    // Log the deletion action
    let is_moderation_action = row.author_id != Some(auth.user_id);
    let action_name = if is_moderation_action {
        if user_role == "admin" {
            "delete_story_by_admin"
        } else {
            "delete_story_by_moderator"
        }
    } else {
        "delete_story_by_author"
    };

    let details = serde_json::json!({
        "title": row.title,
        "author_id": row.author_id,
        "author_name": row.author_name,
        "is_moderation": is_moderation_action
    });

    sqlx::query(
        "INSERT INTO moderation_audit_logs (moderator_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(auth.user_id)
    .bind(action_name)
    .bind("story")
    .bind(id)
    .bind(&details)
    .execute(&pool)
    .await?;

    if is_moderation_action {
        if let Some(author_id) = row.author_id {
            let reason_str = query.reason.as_deref().unwrap_or("No reason specified");
            let message = format!("Your story '{}' was removed by a moderator. Reason: {}", row.title, reason_str);
            let _ = sqlx::query(
                "INSERT INTO notifications (user_id, message) VALUES ($1, $2)"
            )
            .bind(author_id)
            .bind(&message)
            .execute(&pool)
            .await;
        }
    }

    let cover_url = row.cover.clone();
    let result = sqlx::query("DELETE FROM stories WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found("Story not found."));
    }

    // Delete the old cover from storage asynchronously if unreferenced (F-010)
    let pool_cloned = pool.clone();
    tokio::spawn(async move {
        let ref_count: (i64,) = sqlx::query_as(
            "SELECT (SELECT COUNT(*) FROM profiles WHERE avatar_url = $1) + \
             (SELECT COUNT(*) FROM stories WHERE cover = $1) + \
             (SELECT COUNT(*) FROM chapter_pages WHERE bg = $1 OR bg = 'url(''' || $1 || ''')')"
        )
        .bind(&cover_url)
        .fetch_one(&pool_cloned)
        .await
        .unwrap_or((1,));

        if ref_count.0 == 0 {
            crate::routes::upload::delete_uploaded_file(&cover_url).await;
        }
    });

    Ok(Json(serde_json::json!({ "message": "Story deleted." })))
}

/// PUT /api/stories/:id
pub async fn update_story(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateStoryRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Check if the story exists and retrieve its author_id
    let row = fetch_story_row(&pool, id)
        .await?
        .ok_or_else(|| AppError::not_found("Story not found."))?;

    // Only allow updating if the user has collaborator access (author or accepted collaborator)
    let has_access = crate::routes::collaborators::check_collaborator_access(&pool, auth.user_id, id).await?;
    if !has_access {
        return Err(AppError::forbidden("You do not have permission to edit this story."));
    }

    // Capture old cover image url to clean up if changed/removed
    let old_cover = row.cover.clone();
    let mut cover_was_removed_or_replaced = false;
    let mut cover_to_delete = String::new();

    if let Some(ref new_cover) = body.cover {
        if new_cover != &old_cover {
            cover_was_removed_or_replaced = true;
            cover_to_delete = old_cover.clone();
        }
    }

    // Build update query dynamically
    let title = body.title.unwrap_or_else(|| row.title.clone());

    if title.trim().is_empty() {
        return Err(AppError::bad_request("Story title cannot be empty."));
    }

    if title.trim().to_lowercase() != row.title.trim().to_lowercase() {
        let title_exists: (bool,) = sqlx::query_as(
            "SELECT EXISTS(SELECT 1 FROM stories WHERE LOWER(TRIM(title)) = LOWER(TRIM($1)) AND id != $2)"
        )
        .bind(&title)
        .bind(id)
        .fetch_one(&pool)
        .await?;

        if title_exists.0 {
            return Err(AppError::bad_request("A story with this title already exists. Please choose a different title."));
        }
    }

    let genre = body.genre.map(|g| normalize_genre(&g)).unwrap_or(row.genre);
    let description = body.description.unwrap_or(row.description);
    // SB-18: bound title/description on update too.
    validate_story_text(&title, "Title").map_err(AppError::bad_request)?;
    validate_story_text(&description, "Description").map_err(AppError::bad_request)?;
    let mut cover = body.cover.map(|c| c.trim().to_string()).unwrap_or(row.cover);
    // SB-08: validate before storing; see create_story.
    if !crate::routes::upload::is_valid_stored_media_url(&cover) {
        return Err(AppError::bad_request(
            "Invalid cover image. Please upload the cover using the image upload control.",
        ));
    }
    if cover.is_empty() {
        cover = random_cover();
    }
    let status = body.status.map(|s| normalize_status(&s)).unwrap_or(row.status);
    let language = body.language.map(|l| normalize_language(&l)).unwrap_or(row.language);
    let license = body.license.unwrap_or(row.license);
    let is_promoted = body.is_promoted;
    let tags_val = match body.tags {
        Some(t) => {
            let p = is_promoted.unwrap_or_else(|| {
                row.tags.as_array().map(|arr| arr.iter().any(|v| v.as_str().map(|s| s.eq_ignore_ascii_case("promoted")).unwrap_or(false))).unwrap_or(false)
            });
            let norm = normalize_tags(&t, p);
            serde_json::json!(norm)
        }
        None => {
            if let Some(p) = is_promoted {
                let existing: Vec<String> = row.tags.as_array().map(|arr| arr.iter().filter_map(|v| v.as_str().map(ToString::to_string)).collect()).unwrap_or_default();
                let norm = normalize_tags(&existing, p);
                serde_json::json!(norm)
            } else {
                row.tags
            }
        }
    };
    let raw_eligibility = body.eligibility.or(body.content_rating).unwrap_or_else(|| {
        row.content_rating.clone().unwrap_or_else(|| if row.is_nsfw { "18+".to_string() } else { "All ages".to_string() })
    });
    let is_nsfw = raw_eligibility == "18+" || body.is_nsfw.unwrap_or(row.is_nsfw);
    let eligibility = if is_nsfw && raw_eligibility != "18+" { "18+".to_string() } else { raw_eligibility };

    sqlx::query(
        "UPDATE stories SET title = $1, genre = $2, description = $3, cover = $4, status = $5, language = $6, license = $7, tags = $8, is_nsfw = $9, content_rating = $10 WHERE id = $11"
    )
    .bind(&title)
    .bind(&genre)
    .bind(&description)
    .bind(&cover)
    .bind(&status)
    .bind(&language)
    .bind(&license)
    .bind(&tags_val)
    .bind(is_nsfw)
    .bind(&eligibility)
    .bind(id)
    .execute(&pool)
    .await?;

    // Delete old cover from storage asynchronously if replaced/removed and unreferenced (F-010)
    if cover_was_removed_or_replaced && !cover_to_delete.is_empty() {
        let pool_cloned = pool.clone();
        tokio::spawn(async move {
            let ref_count: (i64,) = sqlx::query_as(
                "SELECT (SELECT COUNT(*) FROM profiles WHERE avatar_url = $1) + \
                 (SELECT COUNT(*) FROM stories WHERE cover = $1) + \
                 (SELECT COUNT(*) FROM chapter_pages WHERE bg = $1 OR bg LIKE '%' || $1 || '%')"
            )
            .bind(&cover_to_delete)
            .fetch_one(&pool_cloned)
            .await
            .unwrap_or((1,));

            if ref_count.0 == 0 {
                crate::routes::upload::delete_uploaded_file(&cover_to_delete).await;
            }
        });
    }

    Ok(Json(serde_json::json!({ "message": "Story updated." })))
}


pub async fn create_story(
    State(pool): State<PgPool>,
    headers: HeaderMap,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    auth: AuthUser,
    Json(body): Json<CreateStoryRequest>,
) -> Result<(StatusCode, Json<StoryResponse>), AppError> {
    // Geolocalized country restriction.
    //
    // SB-10: this previously read `cf-ipcountry` unconditionally. That header is
    // injected by Cloudflare, not by us, and the API is reachable directly at
    // kathasangam-backend.onrender.com — so the header was simply absent for most
    // requests (check skipped) and trivially forgeable by anyone who did send it
    // (`curl -H 'cf-ipcountry: IN'`). Now the value is only honoured when the request
    // actually arrived through a trusted proxy.
    if let Some(country_code) =
        crate::middleware::trusted_proxy_header(&headers, peer, "cf-ipcountry")
    {
        if country_code.to_uppercase() != "IN" {
            return Err(AppError::forbidden(
                "Story creation is only allowed for users located in India.",
            ));
        }
    } else if crate::middleware::enforce_geo_restriction() {
        return Err(AppError::forbidden(
            "Story creation requires a verified country location from a trusted proxy.",
        ));
    } else {
        // The country could not be established. This is a fail-open path and is
        // logged loudly: configure TRUSTED_PROXIES (and put the service behind that
        // proxy) for the restriction to be enforceable.
        tracing::warn!(
            "Story creation allowed without a verified country; \
             configure TRUSTED_PROXIES and set ENFORCE_GEO_RESTRICTION=true to enforce the India-only publishing policy"
        );
    }

    if body.title.trim().is_empty() {
        return Err(AppError::bad_request("Story title cannot be empty."));
    }
    // SB-18: bound user input so story rows cannot grow without limit.
    if let Err(message) = validate_story_text(&body.title, "Title") {
        return Err(AppError::bad_request(message));
    }
    if let Err(message) = validate_story_text(&body.description, "Description") {
        return Err(AppError::bad_request(message));
    }
    if let Some(tags) = body.tags.as_ref() {
        if tags.len() > MAX_STORY_TAGS {
            return Err(AppError::bad_request(format!(
                "A story may have at most {MAX_STORY_TAGS} tags."
            )));
        }
        for tag in tags {
            if let Err(message) = validate_story_text(tag, "Tag") {
                return Err(AppError::bad_request(message));
            }
        }
    }

    // Case-insensitive title uniqueness check
    let title_exists: (bool,) = sqlx::query_as(
        "SELECT EXISTS(SELECT 1 FROM stories WHERE LOWER(TRIM(title)) = LOWER(TRIM($1)))"
    )
    .bind(&body.title)
    .fetch_one(&pool)
    .await?;

    if title_exists.0 {
        return Err(AppError::bad_request("A story with this title already exists. Please choose a different title."));
    }
    let id = Uuid::new_v4();
    let author_id = auth.user_id;
    let story_type = normalize_story_type(&body.story_type);
    let genre = normalize_genre(&body.genre);
    let mut initial_tags = vec![
        genre.to_lowercase(),
        story_type.to_lowercase(),
    ];
    if let Some(user_tags) = &body.tags {
        initial_tags.extend(user_tags.clone());
    }
    let is_promoted = body.is_promoted.unwrap_or(false);
    let normalized = normalize_tags(&initial_tags, is_promoted);
    let tags_json = serde_json::json!(normalized);

    let cover = body.cover.map(|c| c.trim().to_string()).unwrap_or_else(random_cover);
    // SB-08: `cover` was stored verbatim. Any later story deletion or cover swap
    // passes this value to `delete_uploaded_file`, which builds a service-role
    // DELETE (or a local remove_file) from it — so an unvalidated cover allowed
    // deleting objects outside the uploads bucket. Constrain it here.
    if !crate::routes::upload::is_valid_stored_media_url(&cover) {
        return Err(AppError::bad_request(
            "Invalid cover image. Please upload the cover using the image upload control.",
        ));
    }
    let language = normalize_language(body.language.as_deref().unwrap_or("English"));

    let raw_eligibility = body.eligibility.or(body.content_rating).unwrap_or_else(|| {
        if body.is_nsfw.unwrap_or(false) { "18+".to_string() } else { "All ages".to_string() }
    });
    let is_nsfw_val = raw_eligibility == "18+" || body.is_nsfw.unwrap_or(false);
    let eligibility_val = if is_nsfw_val && raw_eligibility != "18+" { "18+".to_string() } else { raw_eligibility };
    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO stories (id, author_id, title, type, genre, status, tags, description, cover, language, is_nsfw, content_rating) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)"
    )
        .bind(id).bind(author_id).bind(&body.title)
        .bind(&story_type).bind(&genre)
        .bind("draft").bind(&tags_json).bind(&body.description).bind(&cover)
        .bind(&language).bind(is_nsfw_val).bind(&eligibility_val)
        .execute(&mut *tx)
        .await?;

    // Create initial chapter
    let ch_id = Uuid::new_v4();
    sqlx::query("INSERT INTO chapters (id, story_id, sort_order, title, status, access) VALUES ($1,$2,0,'Chapter 1','draft','free')")
        .bind(ch_id).bind(id)
        .execute(&mut *tx).await?;

    let content_id = Uuid::new_v4();
    sqlx::query("INSERT INTO chapter_content (id, chapter_id, sort_order, paragraph) VALUES ($1,$2,0,'Start writing here.')")
        .bind(content_id).bind(ch_id)
        .execute(&mut *tx).await?;

    if is_chitrank(&story_type) {
        let page_id = Uuid::new_v4();
        sqlx::query("INSERT INTO chapter_pages (id, chapter_id, page_index, label, bg) VALUES ($1,$2,0,'Page 1','linear-gradient(135deg, #243337, #b34e3a 55%, #f3d58a)')")
            .bind(page_id).bind(ch_id)
            .execute(&mut *tx).await?;
    }

    tx.commit().await?;

    let row: StoryRow = fetch_story_row(&pool, id)
        .await?
        .ok_or_else(|| AppError::internal_server_error("Failed to retrieve created story."))?;
    let resp = build_story_response(&pool, &row, Some(auth.user_id)).await?;

    Ok((StatusCode::CREATED, Json(resp)))
}

/// GET /api/stats
pub async fn get_stats(
    opt_auth: OptionalAuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<StatsResponse>, AppError> {
    let row: (i64, i64, i64) = sqlx::query_as(
        "SELECT \
         (SELECT COUNT(*) FROM stories WHERE status != 'draft' AND status != 'unpublished'), \
         (SELECT COALESCE(SUM(views), 0) FROM stories), \
         (SELECT COALESCE(SUM(followers), 0) FROM stories)"
    )
    .fetch_one(&pool)
    .await?;

    // Only expose open_reports count to authenticated staff
    let open_reports = if let Some(user_id) = opt_auth.user_id {
        let role_row: Option<(String,)> = sqlx::query_as(
            "SELECT role::text FROM profiles WHERE id = $1"
        )
        .bind(user_id)
        .fetch_optional(&pool)
        .await?;
        match role_row {
            Some((role,)) if role == "admin" || role == "moderator" => {
                let count: (i64,) = sqlx::query_as(
                    "SELECT COUNT(*) FROM reports WHERE status = 'open'"
                )
                .fetch_one(&pool)
                .await?;
                count.0
            }
            _ => 0,
        }
    } else {
        0
    };

    Ok(Json(StatsResponse {
        published: row.0,
        views: row.1,
        followers: row.2,
        open_reports,
    }))
}

// ── helpers ──

pub async fn build_story_response(
    pool: &PgPool,
    row: &StoryRow,
    auth: Option<Uuid>,
) -> Result<StoryResponse, sqlx::Error> {
    let mut responses = build_story_responses_batch(pool, std::slice::from_ref(row), auth).await?;
    Ok(responses.swap_remove(0))
}

pub async fn build_story_responses_batch(
    pool: &PgPool,
    rows: &[StoryRow],
    auth: Option<Uuid>,
) -> Result<Vec<StoryResponse>, sqlx::Error> {
    build_story_responses_batch_mode(pool, rows, auth, true).await
}

async fn build_story_metadata_responses_batch(
    pool: &PgPool,
    rows: &[StoryRow],
    auth: Option<Uuid>,
) -> Result<Vec<StoryResponse>, sqlx::Error> {
    build_story_responses_batch_mode(pool, rows, auth, false).await
}

async fn build_story_responses_batch_mode(
    pool: &PgPool,
    rows: &[StoryRow],
    auth: Option<Uuid>,
    include_chapter_content: bool,
) -> Result<Vec<StoryResponse>, sqlx::Error> {
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let story_ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();
    let collab_rows: Vec<(Uuid, Uuid, Uuid, String, String, String, String)> = if story_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as(
            "SELECT c.story_id, c.id, c.user_id, p.username, COALESCE(p.avatar_url, '') as avatar_url, c.role, c.status \
             FROM story_collaborators c \
             JOIN profiles p ON c.user_id = p.id \
             WHERE c.story_id = ANY($1)"
        )
        .bind(&story_ids)
        .fetch_all(pool)
        .await?
    };

    let mut collabs_by_story: HashMap<Uuid, Vec<CollaboratorResponse>> = HashMap::new();
    for r in collab_rows {
        collabs_by_story.entry(r.0).or_default().push(CollaboratorResponse {
            id: r.1,
            user_id: r.2,
            username: r.3,
            avatar_url: r.4,
            role: r.5,
            status: r.6,
        });
    }

    let rating_aggregates: Vec<(Uuid, f64, i64)> = if story_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as(
            "SELECT story_id, COALESCE(AVG(rating)::float8, 0.0), COUNT(*)::int8 \
             FROM story_ratings \
             WHERE story_id = ANY($1) \
             GROUP BY story_id"
        )
        .bind(&story_ids)
        .fetch_all(pool)
        .await?
    };

    let mut ratings_map: HashMap<Uuid, (f64, i64)> = HashMap::new();
    for (sid, avg, cnt) in rating_aggregates {
        ratings_map.insert(sid, (avg, cnt));
    }

    let user_ratings_map: HashMap<Uuid, i16> = if let Some(uid) = auth {
        if story_ids.is_empty() {
            HashMap::new()
        } else {
            let u_rows: Vec<(Uuid, i16)> = sqlx::query_as(
                "SELECT story_id, rating FROM story_ratings WHERE story_id = ANY($1) AND user_id = $2"
            )
            .bind(&story_ids)
            .bind(uid)
            .fetch_all(pool)
            .await?;
            u_rows.into_iter().collect()
        }
    } else {
        HashMap::new()
    };

    // F-013 & F-014: Check NSFW and publication status before building responses
    let (is_eighteen_plus, nsfw_pref) = match auth {
        Some(uid) => {
            let is_18 = is_user_eighteen_plus(pool, uid).await;
            let pref = get_user_nsfw_preference(pool, uid).await;
            (is_18, pref)
        }
        None => (false, "hide".to_string()),
    };

    let visible_rows: Vec<&StoryRow> = rows
        .iter()
        .filter(|row| {
            let is_owner = auth.map(|uid| Some(uid) == row.author_id).unwrap_or(false);
            let is_collab = auth
                .map(|uid| {
                    collabs_by_story
                        .get(&row.id)
                        .map(|list| list.iter().any(|c| c.user_id == uid && c.status == "accepted"))
                        .unwrap_or(false)
                })
                .unwrap_or(false);

            if is_owner || is_collab {
                return true;
            }

            let status = row.status.to_lowercase();
            if status == "draft" || status == "unpublished" {
                return false;
            }

            if row.is_nsfw && (!is_eighteen_plus || nsfw_pref == "hide") {
                return false;
            }

            true
        })
        .collect();

    // Helper to filter collaborators: hide invited status from non-members (F-028)
    let get_collaborators = |story_id: &Uuid, is_member: bool| -> Vec<CollaboratorResponse> {
        let collabs = collabs_by_story.get(story_id).cloned().unwrap_or_default();
        if is_member {
            collabs
        } else {
            collabs.into_iter().filter(|c| c.status == "accepted").collect()
        }
    };

    // Split story IDs into owned vs non-owned for chapter visibility
    let mut owned_ids: Vec<Uuid> = Vec::new();
    let mut non_owned_ids: Vec<Uuid> = Vec::new();
    for row in &visible_rows {
        let is_owner = auth
            .map(|uid| Some(uid) == row.author_id)
            .unwrap_or(false);

        let is_accepted_collab = auth
            .map(|uid| {
                collabs_by_story.get(&row.id)
                    .map(|list| list.iter().any(|c| c.user_id == uid && c.status == "accepted"))
                    .unwrap_or(false)
            })
            .unwrap_or(false);

        let show_all = is_owner || is_accepted_collab;
        if show_all {
            owned_ids.push(row.id);
        } else {
            non_owned_ids.push(row.id);
        }
    }

    // Fetch chapters in two batches (owned see all, non-owned see published only)
    let owned_chapters_fut = async {
        if owned_ids.is_empty() {
            Ok(Vec::new())
        } else {
            sqlx::query_as::<_, ChapterRow>(
                "SELECT * FROM chapters WHERE story_id = ANY($1) ORDER BY sort_order",
            )
            .bind(&owned_ids)
            .fetch_all(pool)
            .await
        }
    };
    let non_owned_chapters_fut = async {
        if non_owned_ids.is_empty() {
            Ok(Vec::new())
        } else {
            sqlx::query_as::<_, ChapterRow>(
                "SELECT * FROM chapters WHERE story_id = ANY($1) AND status = 'published' \
                 AND (scheduled_at IS NULL OR scheduled_at <= NOW()) ORDER BY sort_order",
            )
            .bind(&non_owned_ids)
            .fetch_all(pool)
            .await
        }
    };

    let (owned_chapters, non_owned_chapters) =
        tokio::try_join!(owned_chapters_fut, non_owned_chapters_fut)?;

    // Merge all chapter rows
    let all_chapters: Vec<ChapterRow> = owned_chapters
        .into_iter()
        .chain(non_owned_chapters)
        .collect();

    let all_chapter_ids: Vec<Uuid> = all_chapters.iter().map(|ch| ch.id).collect();

    // Group chapters by story_id
    let mut chapters_by_story: HashMap<Uuid, Vec<&ChapterRow>> = HashMap::new();
    for ch in &all_chapters {
        chapters_by_story.entry(ch.story_id).or_default().push(ch);
    }

    if !include_chapter_content {
        return Ok(visible_rows.iter().map(|row| {
            let chapters = chapters_by_story.get(&row.id).map(|chs| {
                chs.iter().map(|ch| ChapterResponse {
                    id: ch.id,
                    sort_order: ch.sort_order,
                    title: ch.title.clone(),
                    status: ch.status.clone(),
                    access: ch.access.clone(),
                    scheduled_at: ch.scheduled_at,
                    created_at: ch.created_at,
                    words: ch.words,
                    reads: ch.reads,
                    likes: ch.likes,
                    content: None,
                    pages: None,
                    comments: Vec::new(),
                }).collect()
            }).unwrap_or_default();
            let is_member = owned_ids.contains(&row.id);
            let collaborators = get_collaborators(&row.id, is_member);
            let rating_info = ratings_map.get(&row.id).copied();
            let user_rating = user_ratings_map.get(&row.id).copied();
            assemble_story(row, chapters, collaborators, rating_info, user_rating)
        }).collect());
    }

    // If no chapters exist, return stories with empty chapter vecs
    if all_chapter_ids.is_empty() {
        return Ok(visible_rows.iter().map(|row| {
            let is_member = owned_ids.contains(&row.id);
            let collaborators = get_collaborators(&row.id, is_member);
            let rating_info = ratings_map.get(&row.id).copied();
            let user_rating = user_ratings_map.get(&row.id).copied();
            assemble_story(row, Vec::new(), collaborators, rating_info, user_rating)
        }).collect());
    }

    // Batch fetch content, pages, comments for ALL chapters at once
    let content_fut = sqlx::query_as::<_, ContentRow>(
        "SELECT * FROM chapter_content WHERE chapter_id = ANY($1) ORDER BY sort_order",
    )
    .bind(&all_chapter_ids)
    .fetch_all(pool);

    let pages_fut = sqlx::query_as::<_, PageRow>(
        "SELECT * FROM chapter_pages WHERE chapter_id = ANY($1) ORDER BY page_index",
    )
    .bind(&all_chapter_ids)
    .fetch_all(pool);

    // Include c.chapter_id as first field so we can group by it
    let comments_fut = sqlx::query_as::<_, (Uuid, Uuid, Option<Uuid>, String, String, Option<i32>, Option<Uuid>, bool)>(
        "SELECT c.chapter_id, c.id, c.user_id, c.content, COALESCE(p.username, 'Reader'), c.paragraph_index, c.parent_id, \
                EXISTS ( \
                    SELECT 1 FROM tips t \
                    JOIN chapters ch ON ch.id = c.chapter_id \
                    JOIN stories s ON s.id = ch.story_id \
                    WHERE t.user_id = c.user_id \
                      AND t.status = 'completed' \
                      AND (t.story_id = s.id OR t.author_id = s.author_id) \
                ) AS is_supporter \
         FROM comments c \
         LEFT JOIN profiles p ON c.user_id = p.id \
         WHERE c.chapter_id = ANY($1) \
         ORDER BY c.created_at",
    )
    .bind(&all_chapter_ids)
    .fetch_all(pool);

    let (all_content, all_pages, all_comments) =
        tokio::try_join!(content_fut, pages_fut, comments_fut)?;

    // Group by chapter_id
    let mut content_map: HashMap<Uuid, Vec<ContentRow>> = HashMap::new();
    for c in all_content {
        content_map.entry(c.chapter_id).or_default().push(c);
    }
    let mut page_map: HashMap<Uuid, Vec<PageRow>> = HashMap::new();
    for p in all_pages {
        page_map.entry(p.chapter_id).or_default().push(p);
    }
    let mut comment_map: HashMap<Uuid, Vec<(Uuid, Option<Uuid>, String, String, Option<i32>, Option<Uuid>, bool)>> =
        HashMap::new();
    for (chapter_id, id, user_id, text, username, paragraph_index, parent_id, is_supporter) in all_comments {
        comment_map
            .entry(chapter_id)
            .or_default()
            .push((id, user_id, text, username, paragraph_index, parent_id, is_supporter));
    }

    // Assemble responses
    let responses = visible_rows
        .iter()
        .map(|row| {
            let chapter_rows = chapters_by_story.get(&row.id);
            let chapters: Vec<ChapterResponse> = chapter_rows
                .map(|chs| {
                    chs.iter()
                        .map(|ch| {
                            let content_rows = content_map.get(&ch.id);
                            let content = content_rows.and_then(|rows| {
                                if rows.is_empty() {
                                    None
                                } else {
                                    Some(rows.iter().map(|c| c.paragraph.clone()).collect())
                                }
                            });

                            let page_rows = page_map.get(&ch.id);
                            let pages = page_rows.and_then(|rows| {
                                if rows.is_empty() {
                                    None
                                } else {
                                    Some(
                                        rows.iter()
                                            .map(|p| PageResponse {
                                                label: p.label.clone(),
                                                bg: p.bg.clone(),
                                            })
                                            .collect(),
                                    )
                                }
                            });

                            let comment_rows = comment_map.remove(&ch.id).unwrap_or_default();
                            let comments = comment_rows
                                .into_iter()
                                .map(|(id, user_id, text, username, paragraph_index, parent_id, is_supporter)| {
                                    let is_deleted = text == "[deleted]" || user_id.is_none();
                                    CommentResponse {
                                        id,
                                        user_id,
                                        user: if is_deleted { "[deleted]".to_string() } else { username },
                                        text,
                                        paragraph_index,
                                        parent_id,
                                        is_supporter: if is_deleted { false } else { is_supporter },
                                    }
                                })
                                .collect();

                            ChapterResponse {
                                id: ch.id,
                                sort_order: ch.sort_order,
                                title: ch.title.clone(),
                                status: ch.status.clone(),
                                access: ch.access.clone(),
                                scheduled_at: ch.scheduled_at,
                                created_at: ch.created_at,
                                words: ch.words,
                                reads: ch.reads,
                                likes: ch.likes,
                                content,
                                pages,
                                comments,
                            }
                        })
                        .collect()
                })
                .unwrap_or_default();

            let is_member = owned_ids.contains(&row.id);
            let collaborators = get_collaborators(&row.id, is_member);
            let rating_info = ratings_map.get(&row.id).copied();
            let user_rating = user_ratings_map.get(&row.id).copied();
            assemble_story(row, chapters, collaborators, rating_info, user_rating)
        })
        .collect();

    Ok(responses)
}

fn assemble_story(
    row: &StoryRow,
    chapters: Vec<ChapterResponse>,
    collaborators: Vec<CollaboratorResponse>,
    rating_info: Option<(f64, i64)>,
    user_rating: Option<i16>,
) -> StoryResponse {
    let tags: Vec<String> = row
        .tags
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(ToString::to_string))
                .collect()
        })
        .unwrap_or_default();

    let is_promoted = tags.iter().any(|t| t.eq_ignore_ascii_case("promoted") || t.eq_ignore_ascii_case("sponsored"));

    let (rating, ratings_count) = match rating_info {
        Some((avg, cnt)) if cnt > 0 => (Some((avg * 10.0).round() / 10.0), cnt),
        _ => (None, 0),
    };

    let eligibility = row.content_rating.clone().unwrap_or_else(|| {
        if row.is_nsfw { "18+".to_string() } else { "All ages".to_string() }
    });

    StoryResponse {
        id: row.id,
        author_id: row.author_id,
        title: row.title.clone(),
        author: row.author_name.clone(),
        story_type: row.story_type.clone(),
        genre: row.genre.clone(),
        language: row.language.clone(),
        license: row.license.clone(),
        status: row.status.clone(),
        tags,
        description: row.description.clone(),
        cover: row.cover.clone(),
        followers: row.followers,
        views: row.views,
        likes: row.likes,
        earnings: row.earnings,
        progress: row.progress,
        created_at: row.created_at,
        chapters,
        collaborators,
        is_nsfw: row.is_nsfw,
        is_promoted,
        content_rating: eligibility.clone(),
        eligibility,
        rating,
        ratings_count,
        user_rating,
    }
}

/// GET /api/stories/recommended
pub async fn recommended_stories(
    // SB-05: was `Option<AuthUser>`.
    auth: OptionalAuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<RecommendationResponse>, AppError> {
    let (is_eighteen_plus, nsfw_pref) = match auth.user_id {
        Some(uid) => {
            let is_18 = is_user_eighteen_plus(&pool, uid).await;
            let pref = get_user_nsfw_preference(&pool, uid).await;
            (is_18, pref)
        }
        None => (false, "hide".to_string()),
    };

    // If authenticated, check for followed or read stories
    if let Some(u) = auth.user_id {
        let user_stories: Vec<(String, serde_json::Value)> = sqlx::query_as(
            "SELECT DISTINCT s.genre, s.tags FROM stories s \
             WHERE s.id IN ( \
                 SELECT story_id FROM reading_progress WHERE user_id = $1 \
                 UNION \
                 SELECT story_id FROM library WHERE user_id = $1 \
                 UNION \
                 SELECT story_id FROM bookmarks WHERE user_id = $1 \
             )"
        )
        .bind(u)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        if !user_stories.is_empty() {
            let mut genre_counts: HashMap<String, usize> = HashMap::new();
            for (genre_str, tags_val) in &user_stories {
                for g in genre_str.split(',') {
                    let g_trim = g.trim().to_string();
                    if !g_trim.is_empty() {
                        *genre_counts.entry(g_trim).or_insert(0) += 1;
                    }
                }
                if let Some(arr) = tags_val.as_array() {
                    for t in arr {
                        if let Some(tag_str) = t.as_str() {
                            let t_trim = tag_str.trim().to_string();
                            if !t_trim.is_empty() {
                                *genre_counts.entry(t_trim).or_insert(0) += 1;
                            }
                        }
                    }
                }
            }

            if let Some((top_genre, _)) = genre_counts.into_iter().max_by_key(|(_, count)| *count) {
                let rows: Vec<StoryRow> = sqlx::query_as(
                    "SELECT stories.id, stories.author_id, COALESCE(profiles.username, 'You') AS author_name, \
                            stories.title, stories.type, stories.genre, stories.language, stories.license, \
                            stories.status, stories.tags, stories.description, stories.cover, stories.followers, \
                            stories.views, stories.likes, stories.earnings, stories.progress, stories.created_at, stories.is_nsfw \
                     FROM stories \
                     LEFT JOIN profiles ON profiles.id = stories.author_id \
                     WHERE (lower(stories.status) NOT IN ('draft', 'unpublished') \
                            OR EXISTS (SELECT 1 FROM chapters WHERE chapters.story_id = stories.id AND chapters.status = 'published')) \
                       AND (stories.author_id IS NULL OR stories.author_id <> $1) \
                       AND stories.id NOT IN ( \
                           SELECT story_id FROM reading_progress WHERE user_id = $1 \
                           UNION \
                           SELECT story_id FROM library WHERE user_id = $1 \
                           UNION \
                           SELECT story_id FROM bookmarks WHERE user_id = $1 \
                       ) \
                       AND (stories.genre ILIKE $2 OR stories.tags::text ILIKE $2) \
                     ORDER BY stories.likes DESC, stories.views DESC \
                     LIMIT 6"
                )
                .bind(u)
                .bind(format!("%{}%", top_genre))
                .fetch_all(&pool)
                .await
                .unwrap_or_default();

                if !rows.is_empty() {
                    let mut items = build_story_metadata_responses_batch(&pool, &rows, auth.user_id).await?;
                    items.retain(|s| {
                        if s.is_nsfw {
                            is_eighteen_plus && nsfw_pref != "hide"
                        } else {
                            true
                        }
                    });

                    if !items.is_empty() {
                        return Ok(Json(RecommendationResponse {
                            items,
                            headline: "Recommended For You".to_string(),
                            reason: format!("Based on your interest in {}", top_genre),
                            is_personalized: true,
                            has_enough_data: true,
                        }));
                    }
                }
            }
        }
    }

    // Cold-start / fallback: Not enough trustworthy data yet or visitor
    let trending_rows: Vec<StoryRow> = sqlx::query_as(
        "SELECT stories.id, stories.author_id, COALESCE(profiles.username, 'You') AS author_name, \
                stories.title, stories.type, stories.genre, stories.language, stories.license, \
                stories.status, stories.tags, stories.description, stories.cover, stories.followers, \
                stories.views, stories.likes, stories.earnings, stories.progress, stories.created_at, stories.is_nsfw \
         FROM stories \
         LEFT JOIN profiles ON profiles.id = stories.author_id \
         WHERE (lower(stories.status) NOT IN ('draft', 'unpublished') \
                OR EXISTS (SELECT 1 FROM chapters WHERE chapters.story_id = stories.id AND chapters.status = 'published')) \
         ORDER BY stories.views DESC, stories.likes DESC \
         LIMIT 6"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let mut items = build_story_metadata_responses_batch(&pool, &trending_rows, auth.user_id).await?;
    items.retain(|s| {
        if s.is_nsfw {
            is_eighteen_plus && nsfw_pref != "hide"
        } else {
            true
        }
    });

    let (headline, reason) = if auth.user_id.is_some() {
        (
            "Trending on KathaSangam".to_string(),
            "Popular stories across the community. Read and follow stories to unlock personalized recommendations.".to_string(),
        )
    } else {
        (
            "Trending on KathaSangam".to_string(),
            "Popular stories across the community. Sign in and start reading to personalize your feed.".to_string(),
        )
    };

    Ok(Json(RecommendationResponse {
        items,
        headline,
        reason,
        is_personalized: false,
        has_enough_data: false,
    }))
}

fn random_cover() -> String {
    let covers = [
        "linear-gradient(135deg, #7b3a12 0%, #e57c33 46%, #fdc5a0 47%, #263746 100%)",
        "linear-gradient(135deg, #2d4057 0%, #fdc5a0 44%, #e57c33 45%, #287c76 100%)",
        "linear-gradient(135deg, #3c2f52 0%, #e57c33 50%, #fdc5a0 51%, #b34e3a 100%)",
    ];
    let idx = (chrono::Utc::now().timestamp_millis() as usize) % covers.len();
    covers[idx].to_string()
}

/// POST /api/stories/:id/like
pub async fn like_story(
    auth: AuthUser,
    Path(story_id): Path<Uuid>,
    State(pool): State<PgPool>,
) -> Result<Json<serde_json::Value>, AppError> {
    let story_status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM stories WHERE id = $1"
    )
    .bind(story_id)
    .fetch_optional(&pool)
    .await?;

    let st = story_status.as_deref().unwrap_or("").to_lowercase();
    if st == "draft" || st == "unpublished" {
        return Err(AppError::bad_request("Story likes are only counted after publishing."));
    }

    let already_liked = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM story_likes WHERE user_id = $1 AND story_id = $2)"
    )
    .bind(auth.user_id)
    .bind(story_id)
    .fetch_one(&pool)
    .await?;

    let (liked, message) = if already_liked {
        sqlx::query("DELETE FROM story_likes WHERE user_id = $1 AND story_id = $2")
            .bind(auth.user_id)
            .bind(story_id)
            .execute(&pool)
            .await?;
        (false, "Story unliked.")
    } else {
        sqlx::query("INSERT INTO story_likes (user_id, story_id) VALUES ($1, $2)")
            .bind(auth.user_id)
            .bind(story_id)
            .execute(&pool)
            .await?;
        (true, "Story liked!")
    };

    let updated_likes = sqlx::query_scalar::<_, i32>(
        "SELECT likes FROM stories WHERE id = $1"
    )
    .bind(story_id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(serde_json::json!({
        "liked": liked,
        "likes": updated_likes,
        "message": message
    })))
}

/// GET /api/stories/:id/liked
pub async fn check_liked(
    // SB-05: was `Option<AuthUser>`.
    auth: OptionalAuthUser,
    Path(story_id): Path<Uuid>,
    State(pool): State<PgPool>,
) -> Result<Json<serde_json::Value>, AppError> {
    let liked = if let Some(uid) = auth.user_id {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM story_likes WHERE user_id = $1 AND story_id = $2)"
        )
        .bind(uid)
        .bind(story_id)
        .fetch_one(&pool)
        .await?
    } else {
        false
    };

    Ok(Json(serde_json::json!({ "liked": liked })))
}

/// POST /api/stories/:id/view
pub async fn view_story(
    auth: OptionalAuthUser,
    Path(story_id): Path<Uuid>,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(pool): State<PgPool>,
) -> Result<Json<serde_json::Value>, AppError> {
    let story_status = match sqlx::query_scalar::<_, String>(
        "SELECT status FROM stories WHERE id = $1"
    )
    .bind(story_id)
    .fetch_optional(&pool)
    .await? {
        Some(s) => s,
        None => return Err(AppError::not_found("Story not found.")),
    };

    let st = story_status.to_lowercase();
    if st == "draft" || st == "unpublished" {
        let current_views = sqlx::query_scalar::<_, i32>(
            "SELECT views FROM stories WHERE id = $1"
        )
        .bind(story_id)
        .fetch_optional(&pool)
        .await?
        .unwrap_or(0);

        return Ok(Json(serde_json::json!({
            "viewed": false,
            "views": current_views
        })));
    }

    // F-029: Resolve client IP securely through trusted proxies
    let ip_address = crate::middleware::resolve_client_ip(&headers, addr);

    // F-023: Atomic view insertion preventing race condition inflation
    let res = sqlx::query(
        "INSERT INTO story_views (story_id, user_id, ip_address) \
         SELECT $1, $2, $3 \
         WHERE NOT EXISTS ( \
             SELECT 1 FROM story_views \
             WHERE story_id = $1 \
               AND (($2::uuid IS NOT NULL AND user_id = $2) OR ($2::uuid IS NULL AND ip_address = $3)) \
               AND viewed_at > NOW() - INTERVAL '24 hours' \
         )"
    )
    .bind(story_id)
    .bind(auth.user_id)
    .bind(&ip_address)
    .execute(&pool)
    .await?;

    let viewed = res.rows_affected() > 0;

    let updated_views = sqlx::query_scalar::<_, i32>(
        "SELECT views FROM stories WHERE id = $1"
    )
    .bind(story_id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(serde_json::json!({
        "viewed": viewed,
        "views": updated_views
    })))
}

/// POST /api/stories/:id/rate
pub async fn rate_story(
    auth: AuthUser,
    Path(story_id): Path<Uuid>,
    State(pool): State<PgPool>,
    Json(payload): Json<RateStoryRequest>,
) -> Result<Json<StoryRatingResponse>, AppError> {
    if payload.rating < 1 || payload.rating > 5 {
        return Err(AppError::bad_request("Rating must be between 1 and 5."));
    }

    let story_status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM stories WHERE id = $1"
    )
    .bind(story_id)
    .fetch_optional(&pool)
    .await?;

    let st = story_status
        .ok_or_else(|| AppError::not_found("Story not found"))?
        .to_lowercase();

    if st == "draft" || st == "unpublished" {
        return Err(AppError::bad_request("Ratings are only allowed for published stories."));
    }

    sqlx::query(
        "INSERT INTO story_ratings (story_id, user_id, rating, updated_at) \
         VALUES ($1, $2, $3, NOW()) \
         ON CONFLICT (story_id, user_id) \
         DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW()"
    )
    .bind(story_id)
    .bind(auth.user_id)
    .bind(payload.rating)
    .execute(&pool)
    .await?;

    let agg: (Option<f64>, i64) = sqlx::query_as(
        "SELECT AVG(rating)::float8, COUNT(*)::int8 FROM story_ratings WHERE story_id = $1"
    )
    .bind(story_id)
    .fetch_one(&pool)
    .await?;

    let dist_rows: Vec<(i16, i64)> = sqlx::query_as(
        "SELECT rating, COUNT(*)::int8 FROM story_ratings WHERE story_id = $1 GROUP BY rating"
    )
    .bind(story_id)
    .fetch_all(&pool)
    .await?;

    let mut distribution = std::collections::BTreeMap::new();
    for star in 1..=5 {
        distribution.insert(star, 0i64);
    }
    for (star, count) in dist_rows {
        distribution.insert(star, count);
    }

    let avg_rating = agg.0.map(|v| (v * 10.0).round() / 10.0).unwrap_or(0.0);

    Ok(Json(StoryRatingResponse {
        story_id,
        average_rating: avg_rating,
        ratings_count: agg.1,
        user_rating: Some(payload.rating),
        distribution,
    }))
}

/// GET /api/stories/:id/rating
pub async fn get_story_rating(
    opt_auth: OptionalAuthUser,
    Path(story_id): Path<Uuid>,
    State(pool): State<PgPool>,
) -> Result<Json<StoryRatingResponse>, AppError> {
    let story_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM stories WHERE id = $1)"
    )
    .bind(story_id)
    .fetch_one(&pool)
    .await?;

    if !story_exists {
        return Err(AppError::not_found("Story not found"));
    }

    let agg: (Option<f64>, i64) = sqlx::query_as(
        "SELECT AVG(rating)::float8, COUNT(*)::int8 FROM story_ratings WHERE story_id = $1"
    )
    .bind(story_id)
    .fetch_one(&pool)
    .await?;

    let dist_rows: Vec<(i16, i64)> = sqlx::query_as(
        "SELECT rating, COUNT(*)::int8 FROM story_ratings WHERE story_id = $1 GROUP BY rating"
    )
    .bind(story_id)
    .fetch_all(&pool)
    .await?;

    let mut distribution = std::collections::BTreeMap::new();
    for star in 1..=5 {
        distribution.insert(star, 0i64);
    }
    for (star, count) in dist_rows {
        distribution.insert(star, count);
    }

    let user_rating = if let Some(uid) = opt_auth.user_id {
        sqlx::query_scalar::<_, i16>(
            "SELECT rating FROM story_ratings WHERE story_id = $1 AND user_id = $2"
        )
        .bind(story_id)
        .bind(uid)
        .fetch_optional(&pool)
        .await?
    } else {
        None
    };

    let avg_rating = agg.0.map(|v| (v * 10.0).round() / 10.0).unwrap_or(0.0);

    Ok(Json(StoryRatingResponse {
        story_id,
        average_rating: avg_rating,
        ratings_count: agg.1,
        user_rating,
        distribution,
    }))
}

