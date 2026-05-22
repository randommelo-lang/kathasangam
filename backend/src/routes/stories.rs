use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::models::*;

const STORY_SELECT_ORDERED: &str = "SELECT stories.id, stories.author_id, COALESCE(profiles.username, 'You') AS author_name, stories.title, stories.type, stories.genre, stories.language, stories.license, stories.status, stories.tags, stories.description, stories.cover, stories.followers, stories.views, stories.likes, stories.earnings, stories.progress, stories.created_at FROM stories LEFT JOIN profiles ON profiles.id = stories.author_id ORDER BY stories.created_at DESC";
const STORY_SELECT_BY_ID: &str = "SELECT stories.id, stories.author_id, COALESCE(profiles.username, 'You') AS author_name, stories.title, stories.type, stories.genre, stories.language, stories.license, stories.status, stories.tags, stories.description, stories.cover, stories.followers, stories.views, stories.likes, stories.earnings, stories.progress, stories.created_at FROM stories LEFT JOIN profiles ON profiles.id = stories.author_id WHERE stories.id = $1";

pub async fn fetch_story_row(pool: &PgPool, id: Uuid) -> Result<Option<StoryRow>, sqlx::Error> {
    sqlx::query_as(STORY_SELECT_BY_ID)
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn get_stories(State(pool): State<PgPool>) -> Json<Vec<StoryModel>> {
    let stories = sqlx::query_as::<_, StoryModel>("SELECT * FROM stories")
        .fetch_all(&pool)
        .await
        .unwrap();

    Json(stories)
}

/// GET /api/stories?q=&genre=&type=
pub async fn list_stories(
    auth: Option<AuthUser>,
    State(pool): State<PgPool>,
    Query(params): Query<StoryQuery>,
) -> Result<Json<Vec<StoryResponse>>, StatusCode> {
    let mut results = Vec::new();
    let mut meili_ids = None;

    if let Some(ref q) = params.q {
        let q_trimmed = q.trim();
        if !q_trimmed.is_empty() {
            match crate::search::search_stories(q_trimmed, 100).await {
                Ok(ids) => {
                    meili_ids = Some(ids);
                }
                Err(e) => {
                    eprintln!("⚠️ Meilisearch search failed, falling back to database: {}", e);
                }
            }
        }
    }

    if let Some(ids) = meili_ids {
        // Fetch rows matching the Meilisearch hits
        let rows: Vec<StoryRow> = sqlx::query_as(
            "SELECT stories.id, stories.author_id, COALESCE(profiles.username, 'You') AS author_name, stories.title, stories.type, stories.genre, stories.language, stories.license, stories.status, stories.tags, stories.description, stories.cover, stories.followers, stories.views, stories.likes, stories.earnings, stories.progress, stories.created_at \
             FROM stories \
             LEFT JOIN profiles ON profiles.id = stories.author_id \
             WHERE stories.id = ANY($1)"
        )
        .bind(&ids)
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error fetching search results: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        let mut responses = Vec::new();
        for row in &rows {
            let resp = build_story_response(&pool, row, auth.as_ref())
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            responses.push(resp);
        }

        // Sort responses to match Meilisearch order
        responses.sort_by_key(|r| ids.iter().position(|&id| id == r.id).unwrap_or(usize::MAX));
        results = responses;
    } else {
        // Original logic: Fetch all stories and apply search filter in-memory as fallback
        let rows: Vec<StoryRow> = sqlx::query_as(STORY_SELECT_ORDERED)
            .fetch_all(&pool)
            .await
            .map_err(|e| {
                eprintln!("Database error fetching stories: {:?}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        for row in &rows {
            let resp = build_story_response(&pool, row, auth.as_ref())
                .await
                .map_err(|e| {
                    eprintln!("Error building story response: {:?}", e);
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;
            results.push(resp);
        }

        if let Some(ref q) = params.q {
            let q = q.to_lowercase();
            results.retain(|s| {
                s.title.to_lowercase().contains(&q)
                    || s.author.to_lowercase().contains(&q)
                    || s.description.to_lowercase().contains(&q)
                    || s.tags.iter().any(|t| t.to_lowercase().contains(&q))
            });
        }
    }

    if let Some(ref genre) = params.genre {
        if genre != "all" {
            results.retain(|s| &s.genre == genre);
        }
    }
    if let Some(ref st) = params.story_type {
        if st != "all" {
            results.retain(|s| &s.story_type == st);
        }
    }

    Ok(Json(results))
}

/// GET /api/stories/:id
pub async fn get_story(
    auth: Option<AuthUser>,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<StoryResponse>, StatusCode> {
    let row: StoryRow = fetch_story_row(&pool, id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let resp = build_story_response(&pool, &row, auth.as_ref())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(resp))
}

/// DELETE /api/stories/:id
pub async fn delete_story(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // Check if the story exists and retrieve its author_id
    let row = fetch_story_row(&pool, id)
        .await
        .map_err(|e| {
            eprintln!("Database error checking story ownership: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Fetch the user's role from profiles
    let (user_role,): (String,) = sqlx::query_as("SELECT role::text FROM profiles WHERE id = $1")
        .bind(auth.user_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error fetching user role: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Allow deleting only if the user is the author OR if they are an admin
    if row.author_id != Some(auth.user_id) && user_role != "admin" {
        return Err(StatusCode::FORBIDDEN);
    }

    // Log the deletion action
    let is_moderation_action = row.author_id != Some(auth.user_id);
    let action_name = if is_moderation_action { "delete_story_by_admin" } else { "delete_story_by_author" };

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
    .await
    .map_err(|e| {
        eprintln!("Failed to write moderation audit log for story deletion: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let result = sqlx::query("DELETE FROM stories WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            eprintln!("Database error deleting story: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    // De-index story from Meilisearch
    tokio::spawn(async move {
        if let Err(e) = crate::search::deindex_story(id).await {
            eprintln!("⚠️ Failed to de-index story {} from Meilisearch: {}", id, e);
        }
    });

    Ok(Json(serde_json::json!({ "message": "Story deleted." })))
}

/// POST /api/stories
pub async fn create_story(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<CreateStoryRequest>,
) -> Result<(StatusCode, Json<StoryResponse>), StatusCode> {
    let id = Uuid::new_v4();
    let author_id = auth.user_id;
    let tags_json = serde_json::json!([
        body.genre.to_lowercase(),
        body.story_type.to_lowercase(),
        "new".to_string(),
    ]);

    let cover = body.cover.unwrap_or_else(random_cover);

    sqlx::query(
        "INSERT INTO stories (id, author_id, title, type, genre, status, tags, description, cover) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)"
    )
        .bind(id).bind(author_id).bind(&body.title)
        .bind(&body.story_type).bind(&body.genre)
        .bind("draft").bind(&tags_json).bind(&body.description).bind(&cover)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Create initial chapter
    let ch_id = Uuid::new_v4();
    sqlx::query("INSERT INTO chapters (id, story_id, sort_order, title, status, access) VALUES ($1,$2,0,'Chapter 1','draft','free')")
        .bind(ch_id).bind(id)
        .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let content_id = Uuid::new_v4();
    sqlx::query("INSERT INTO chapter_content (id, chapter_id, sort_order, paragraph) VALUES ($1,$2,0,'Start writing here.')")
        .bind(content_id).bind(ch_id)
        .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if body.story_type == "Chitrānk" {
        let page_id = Uuid::new_v4();
        sqlx::query("INSERT INTO chapter_pages (id, chapter_id, page_index, label, bg) VALUES ($1,$2,0,'Page 1','linear-gradient(135deg, #243337, #b34e3a 55%, #f3d58a)')")
            .bind(page_id).bind(ch_id)
            .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    let row: StoryRow = fetch_story_row(&pool, id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let resp = build_story_response(&pool, &row, Some(&auth))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Index the new story in Meilisearch
    let pool_clone = pool.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::search::index_story(&pool_clone, id).await {
            eprintln!("⚠️ Failed to index story {} in Meilisearch: {}", id, e);
        }
    });

    Ok((StatusCode::CREATED, Json(resp)))
}

/// GET /api/stats
pub async fn get_stats(State(pool): State<PgPool>) -> Result<Json<StatsResponse>, StatusCode> {
    let (published,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM stories WHERE status = 'published'")
            .fetch_one(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let (views,): (i64,) = sqlx::query_as("SELECT COALESCE(SUM(views), 0) FROM stories")
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let (followers,): (i64,) = sqlx::query_as("SELECT COALESCE(SUM(followers), 0) FROM stories")
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let (open_reports,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM reports WHERE status = 'open'")
            .fetch_one(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(StatsResponse {
        published,
        views,
        followers,
        open_reports,
    }))
}

// ── helpers ──

pub async fn build_story_response(
    pool: &PgPool,
    row: &StoryRow,
    auth: Option<&AuthUser>,
) -> Result<StoryResponse, sqlx::Error> {
    let mut show_all = false;
    if let Some(user) = auth {
        if Some(user.user_id) == row.author_id {
            show_all = true;
        } else {
            let role: Option<(String,)> = sqlx::query_as("SELECT role::text FROM profiles WHERE id = $1")
                .bind(user.user_id)
                .fetch_optional(pool)
                .await?;
            if let Some((r,)) = role {
                if r == "admin" || r == "moderator" {
                    show_all = true;
                }
            }
        }
    }

    let chapter_rows: Vec<ChapterRow> = if show_all {
        sqlx::query_as("SELECT * FROM chapters WHERE story_id = $1 ORDER BY sort_order")
            .bind(row.id)
            .fetch_all(pool)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM chapters WHERE story_id = $1 AND status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= NOW()) ORDER BY sort_order")
            .bind(row.id)
            .fetch_all(pool)
            .await?
    };

    let mut chapters = Vec::new();
    for ch in &chapter_rows {
        let content_rows: Vec<ContentRow> = sqlx::query_as(
            "SELECT * FROM chapter_content WHERE chapter_id = $1 ORDER BY sort_order",
        )
        .bind(&ch.id)
        .fetch_all(pool)
        .await?;

        let page_rows: Vec<PageRow> =
            sqlx::query_as("SELECT * FROM chapter_pages WHERE chapter_id = $1 ORDER BY page_index")
                .bind(&ch.id)
                .fetch_all(pool)
                .await?;

        let comment_rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT c.content, COALESCE(p.username, 'Reader') \
             FROM comments c \
             LEFT JOIN profiles p ON c.user_id = p.id \
             WHERE c.chapter_id = $1 \
             ORDER BY c.created_at"
        )
        .bind(&ch.id)
        .fetch_all(pool)
        .await?;

        let content = if content_rows.is_empty() {
            None
        } else {
            Some(content_rows.iter().map(|c| c.paragraph.clone()).collect())
        };
        let pages = if page_rows.is_empty() {
            None
        } else {
            Some(
                page_rows
                    .iter()
                    .map(|p| PageResponse {
                        label: p.label.clone(),
                        bg: p.bg.clone(),
                    })
                    .collect(),
            )
        };

        chapters.push(ChapterResponse {
            title: ch.title.clone(),
            status: ch.status.clone(),
            access: ch.access.clone(),
            scheduled_at: ch.scheduled_at.clone(),
            words: ch.words,
            reads: ch.reads,
            likes: ch.likes,
            content,
            pages,
            comments: comment_rows
                .into_iter()
                .map(|(text, username)| CommentResponse {
                    user: username,
                    text,
                })
                .collect(),
        });
    }

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

    Ok(StoryResponse {
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
        chapters,
    })
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
