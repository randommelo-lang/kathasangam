use std::collections::HashMap;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::models::*;
use crate::errors::AppError;

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
) -> Result<Json<Vec<StoryResponse>>, AppError> {
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
                    tracing::error!("⚠️ Meilisearch search failed, falling back to database: {}", e);
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
        .await?;

        let mut responses = build_story_responses_batch(&pool, &rows, auth.as_ref()).await?;

        // Sort responses to match Meilisearch order
        responses.sort_by_key(|r| ids.iter().position(|&id| id == r.id).unwrap_or(usize::MAX));
        results = responses;
    } else {
        // Original logic: Fetch all stories and apply search filter in-memory as fallback
        let rows: Vec<StoryRow> = sqlx::query_as(STORY_SELECT_ORDERED)
            .fetch_all(&pool)
            .await?;

        results = build_story_responses_batch(&pool, &rows, auth.as_ref()).await?;

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

    // Filter by genre
    if let Some(ref genre) = params.genre {
        if !genre.trim().is_empty() && genre.to_lowercase() != "all" {
            let target_genre = genre.to_lowercase();
            results.retain(|s| {
                s.genre
                    .split(',')
                    .map(|g| g.trim().to_lowercase())
                    .any(|g| g == target_genre)
            });
        }
    }

    // Filter by format type
    if let Some(ref story_type) = params.story_type {
        if !story_type.trim().is_empty() {
            results.retain(|s| s.story_type.to_lowercase() == story_type.to_lowercase());
        }
    }

    // Filter by status
    if let Some(ref status) = params.status {
        if !status.trim().is_empty() && status.to_lowercase() != "all" {
            results.retain(|s| s.status.to_lowercase() == status.to_lowercase());
        }
    }

    // Filter by language
    if let Some(ref language) = params.language {
        if !language.trim().is_empty() && language.to_lowercase() != "all" {
            results.retain(|s| s.language.to_lowercase() == language.to_lowercase());
        }
    }

    // Sort by criteria
    if let Some(ref sort_by) = params.sort_by {
        match sort_by.to_lowercase().as_str() {
            "newest" => {
                results.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            }
            "reads" => {
                results.sort_by(|a, b| b.views.cmp(&a.views));
            }
            "likes" => {
                results.sort_by(|a, b| b.likes.cmp(&a.likes));
            }
            "rating" => {
                let calc_rating = |views: i32, likes: i32| -> f64 {
                    if views == 0 {
                        5.0
                    } else {
                        let ratio = likes as f64 / views as f64;
                        let r = 4.0 + ratio * 10.0;
                        r.min(5.0).max(1.0)
                    }
                };
                results.sort_by(|a, b| {
                    let r_a = calc_rating(a.views, a.likes);
                    let r_b = calc_rating(b.views, b.likes);
                    r_b.partial_cmp(&r_a).unwrap_or(std::cmp::Ordering::Equal)
                });
            }
            _ => {}
        }
    }

    Ok(Json(results))
}

/// GET /api/stories/:id
pub async fn get_story(
    auth: Option<AuthUser>,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<StoryResponse>, AppError> {
    let row: StoryRow = fetch_story_row(&pool, id)
        .await?
        .ok_or_else(|| AppError::not_found("Story not found."))?;

    let resp = build_story_response(&pool, &row, auth.as_ref()).await?;
    Ok(Json(resp))
}

/// DELETE /api/stories/:id
pub async fn delete_story(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
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

    // Allow deleting only if the user is the author OR if they are an admin
    if row.author_id != Some(auth.user_id) && user_role != "admin" {
        return Err(AppError::forbidden("You do not have permission to delete this story."));
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
    .await?;

    let cover_url = row.cover.clone();
    let result = sqlx::query("DELETE FROM stories WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found("Story not found."));
    }

    // De-index story from Meilisearch
    tokio::spawn(async move {
        if let Err(e) = crate::search::deindex_story(id).await {
            tracing::error!("⚠️ Failed to de-index story {} from Meilisearch: {}", id, e);
        }
    });

    // Delete the old cover from storage asynchronously
    tokio::spawn(async move {
        crate::routes::upload::delete_uploaded_file(&cover_url).await;
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

    // Only allow updating if the user is the author
    if row.author_id != Some(auth.user_id) {
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
    let title = body.title.unwrap_or(row.title);
    let genre = body.genre.unwrap_or(row.genre);
    let description = body.description.unwrap_or(row.description);
    let mut cover = body.cover.unwrap_or(row.cover);
    if cover.is_empty() {
        cover = random_cover();
    }
    let status = body.status.unwrap_or(row.status);
    let language = body.language.unwrap_or(row.language);
    let license = body.license.unwrap_or(row.license);
    let tags_val = match body.tags {
        Some(t) => serde_json::json!(t),
        None => row.tags,
    };

    sqlx::query(
        "UPDATE stories SET title = $1, genre = $2, description = $3, cover = $4, status = $5, language = $6, license = $7, tags = $8 WHERE id = $9"
    )
    .bind(&title)
    .bind(&genre)
    .bind(&description)
    .bind(&cover)
    .bind(&status)
    .bind(&language)
    .bind(&license)
    .bind(&tags_val)
    .bind(id)
    .execute(&pool)
    .await?;

    // Re-index story in Meilisearch
    let pool_clone = pool.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::search::index_story(&pool_clone, id).await {
            tracing::error!("⚠️ Failed to re-index story {} in Meilisearch: {}", id, e);
        }
    });

    // Delete old cover from storage asynchronously if replaced/removed
    if cover_was_removed_or_replaced && !cover_to_delete.is_empty() {
        tokio::spawn(async move {
            crate::routes::upload::delete_uploaded_file(&cover_to_delete).await;
        });
    }

    Ok(Json(serde_json::json!({ "message": "Story updated." })))
}


/// POST /api/stories
pub async fn create_story(
    State(pool): State<PgPool>,
    auth: AuthUser,
    Json(body): Json<CreateStoryRequest>,
) -> Result<(StatusCode, Json<StoryResponse>), AppError> {
    if body.title.trim().is_empty() {
        return Err(AppError::bad_request("Story title cannot be empty."));
    }
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
        .await?;

    // Create initial chapter
    let ch_id = Uuid::new_v4();
    sqlx::query("INSERT INTO chapters (id, story_id, sort_order, title, status, access) VALUES ($1,$2,0,'Chapter 1','draft','free')")
        .bind(ch_id).bind(id)
        .execute(&pool).await?;

    let content_id = Uuid::new_v4();
    sqlx::query("INSERT INTO chapter_content (id, chapter_id, sort_order, paragraph) VALUES ($1,$2,0,'Start writing here.')")
        .bind(content_id).bind(ch_id)
        .execute(&pool).await?;

    if body.story_type == "Chitrānk" {
        let page_id = Uuid::new_v4();
        sqlx::query("INSERT INTO chapter_pages (id, chapter_id, page_index, label, bg) VALUES ($1,$2,0,'Page 1','linear-gradient(135deg, #243337, #b34e3a 55%, #f3d58a)')")
            .bind(page_id).bind(ch_id)
            .execute(&pool).await?;
    }

    let row: StoryRow = fetch_story_row(&pool, id)
        .await?
        .ok_or_else(|| AppError::internal_server_error("Failed to retrieve created story."))?;
    let resp = build_story_response(&pool, &row, Some(&auth)).await?;

    // Index the new story in Meilisearch
    let pool_clone = pool.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::search::index_story(&pool_clone, id).await {
            tracing::error!("⚠️ Failed to index story {} in Meilisearch: {}", id, e);
        }
    });

    Ok((StatusCode::CREATED, Json(resp)))
}

/// GET /api/stats
pub async fn get_stats(State(pool): State<PgPool>) -> Result<Json<StatsResponse>, AppError> {
    let row: (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT \
         (SELECT COUNT(*) FROM stories WHERE status = 'published'), \
         (SELECT COALESCE(SUM(views), 0) FROM stories), \
         (SELECT COALESCE(SUM(followers), 0) FROM stories), \
         (SELECT COUNT(*) FROM reports WHERE status = 'open')"
    )
    .fetch_one(&pool)
    .await?;

    Ok(Json(StatsResponse {
        published: row.0,
        views: row.1,
        followers: row.2,
        open_reports: row.3,
    }))
}

// ── helpers ──

pub async fn build_story_response(
    pool: &PgPool,
    row: &StoryRow,
    auth: Option<&AuthUser>,
) -> Result<StoryResponse, sqlx::Error> {
    let mut responses = build_story_responses_batch(pool, std::slice::from_ref(row), auth).await?;
    Ok(responses.swap_remove(0))
}

pub async fn build_story_responses_batch(
    pool: &PgPool,
    rows: &[StoryRow],
    auth: Option<&AuthUser>,
) -> Result<Vec<StoryResponse>, sqlx::Error> {
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    // Split story IDs into owned vs non-owned for chapter visibility
    let mut owned_ids: Vec<Uuid> = Vec::new();
    let mut non_owned_ids: Vec<Uuid> = Vec::new();
    for row in rows {
        let show_all = auth
            .map(|u| Some(u.user_id) == row.author_id)
            .unwrap_or(false);
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

    // If no chapters exist, return stories with empty chapter vecs
    if all_chapter_ids.is_empty() {
        return Ok(rows.iter().map(|row| assemble_story(row, Vec::new())).collect());
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
    let comments_fut = sqlx::query_as::<_, (Uuid, Uuid, Option<Uuid>, String, String)>(
        "SELECT c.chapter_id, c.id, c.user_id, c.content, COALESCE(p.username, 'Reader') \
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
    let mut comment_map: HashMap<Uuid, Vec<(Uuid, Option<Uuid>, String, String)>> =
        HashMap::new();
    for (chapter_id, id, user_id, text, username) in all_comments {
        comment_map
            .entry(chapter_id)
            .or_default()
            .push((id, user_id, text, username));
    }

    // Assemble responses
    let responses = rows
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
                                .map(|(id, user_id, text, username)| CommentResponse {
                                    id,
                                    user_id,
                                    user: username,
                                    text,
                                })
                                .collect();

                            ChapterResponse {
                                id: ch.id,
                                sort_order: ch.sort_order,
                                title: ch.title.clone(),
                                status: ch.status.clone(),
                                access: ch.access.clone(),
                                scheduled_at: ch.scheduled_at,
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

            assemble_story(row, chapters)
        })
        .collect();

    Ok(responses)
}

fn assemble_story(row: &StoryRow, chapters: Vec<ChapterResponse>) -> StoryResponse {
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
    }
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
