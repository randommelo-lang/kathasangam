use std::collections::HashMap;

use axum::{
    extract::{Path, Query, State, ConnectInfo},
    http::{StatusCode, HeaderMap},
    Json,
};
use std::net::SocketAddr;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::{AuthUser, OptionalAuthUser};
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

/// GET /api/stories?q=&genre=&type=
pub async fn list_stories(
    auth: Option<AuthUser>,
    State(pool): State<PgPool>,
    Query(params): Query<StoryQuery>,
) -> Result<Json<Vec<StoryResponse>>, AppError> {
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

    let mut results = if let Some(ids) = meili_ids {
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
        responses
    } else {
        // Original logic: Fetch all stories and apply search filter in-memory as fallback
        let rows: Vec<StoryRow> = sqlx::query_as(STORY_SELECT_ORDERED)
            .fetch_all(&pool)
            .await?;

        let mut responses = build_story_responses_batch(&pool, &rows, auth.as_ref()).await?;

        if let Some(ref q) = params.q {
            let q = q.to_lowercase();
            responses.retain(|s| {
                s.title.to_lowercase().contains(&q)
                    || s.author.to_lowercase().contains(&q)
                    || s.description.to_lowercase().contains(&q)
                    || s.tags.iter().any(|t| t.to_lowercase().contains(&q))
            });
        }

        responses
    };

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

    // Visibility check: a story is publicly visible if its status is non-draft OR if it has at least 1 published chapter
    results.retain(|s| {
        let st = s.status.to_lowercase();
        if st != "draft" && st != "unpublished" {
            return true;
        }
        if s.chapters.iter().any(|ch| ch.status == "published") {
            return true;
        }
        if let Some(ref u) = auth {
            if s.author_id == Some(u.user_id) {
                return true;
            }
            if s.collaborators.iter().any(|c| c.user_id == u.user_id && c.status == "accepted") {
                return true;
            }
        }
        false
    });

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

    // Check draft visibility
    if resp.status.to_lowercase() == "draft" {
        let mut allowed = false;
        if let Some(ref u) = auth {
            if resp.author_id == Some(u.user_id) {
                allowed = true;
            } else if resp.collaborators.iter().any(|c| c.user_id == u.user_id && c.status == "accepted") {
                allowed = true;
            }
        }
        if !allowed {
            return Err(AppError::forbidden("You do not have permission to view this story."));
        }
    }

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
    let language = body.language.clone().unwrap_or_else(|| "English".to_string());

    sqlx::query(
        "INSERT INTO stories (id, author_id, title, type, genre, status, tags, description, cover, language) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)"
    )
        .bind(id).bind(author_id).bind(&body.title)
        .bind(&body.story_type).bind(&body.genre)
        .bind("draft").bind(&tags_json).bind(&body.description).bind(&cover)
        .bind(&language)
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

    // Split story IDs into owned vs non-owned for chapter visibility
    let mut owned_ids: Vec<Uuid> = Vec::new();
    let mut non_owned_ids: Vec<Uuid> = Vec::new();
    for row in rows {
        let is_owner = auth
            .map(|u| Some(u.user_id) == row.author_id)
            .unwrap_or(false);

        let is_accepted_collab = auth
            .map(|u| {
                collabs_by_story.get(&row.id)
                    .map(|list| list.iter().any(|c| c.user_id == u.user_id && c.status == "accepted"))
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

    // If no chapters exist, return stories with empty chapter vecs
    if all_chapter_ids.is_empty() {
        return Ok(rows.iter().map(|row| {
            let collaborators = collabs_by_story.get(&row.id).cloned().unwrap_or_default();
            assemble_story(row, Vec::new(), collaborators)
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
    let comments_fut = sqlx::query_as::<_, (Uuid, Uuid, Option<Uuid>, String, String, Option<i32>)>(
        "SELECT c.chapter_id, c.id, c.user_id, c.content, COALESCE(p.username, 'Reader'), c.paragraph_index \
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
    let mut comment_map: HashMap<Uuid, Vec<(Uuid, Option<Uuid>, String, String, Option<i32>)>> =
        HashMap::new();
    for (chapter_id, id, user_id, text, username, paragraph_index) in all_comments {
        comment_map
            .entry(chapter_id)
            .or_default()
            .push((id, user_id, text, username, paragraph_index));
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
                                .map(|(id, user_id, text, username, paragraph_index)| CommentResponse {
                                    id,
                                    user_id,
                                    user: username,
                                    text,
                                    paragraph_index,
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

            let collaborators = collabs_by_story.get(&row.id).cloned().unwrap_or_default();
            assemble_story(row, chapters, collaborators)
        })
        .collect();

    Ok(responses)
}

fn assemble_story(
    row: &StoryRow,
    chapters: Vec<ChapterResponse>,
    collaborators: Vec<CollaboratorResponse>,
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
    auth: Option<AuthUser>,
    Path(story_id): Path<Uuid>,
    State(pool): State<PgPool>,
) -> Result<Json<serde_json::Value>, AppError> {
    let liked = if let Some(auth_user) = auth {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM story_likes WHERE user_id = $1 AND story_id = $2)"
        )
        .bind(auth_user.user_id)
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

    let mut ip_address = addr.ip().to_string();
    if let Some(forwarded_for) = headers.get("x-forwarded-for") {
        if let Ok(val) = forwarded_for.to_str() {
            if let Some(first_ip) = val.split(',').next() {
                let ip = first_ip.trim();
                if !ip.is_empty() {
                    ip_address = ip.to_string();
                }
            }
        }
    } else if let Some(real_ip) = headers.get("x-real-ip") {
        if let Ok(val) = real_ip.to_str() {
            let ip = val.trim();
            if !ip.is_empty() {
                ip_address = ip.to_string();
            }
        }
    }

    let already_viewed = if let Some(user_id) = auth.user_id {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS( \
             SELECT 1 FROM story_views \
             WHERE story_id = $1 \
             AND (user_id = $2 OR ip_address = $3) \
             AND viewed_at > NOW() - INTERVAL '24 hours')"
        )
        .bind(story_id)
        .bind(user_id)
        .bind(&ip_address)
        .fetch_one(&pool)
        .await?
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS( \
             SELECT 1 FROM story_views \
             WHERE story_id = $1 \
             AND ip_address = $2 \
             AND viewed_at > NOW() - INTERVAL '24 hours')"
        )
        .bind(story_id)
        .bind(&ip_address)
        .fetch_one(&pool)
        .await?
    };

    let viewed = if !already_viewed {
        sqlx::query(
            "INSERT INTO story_views (story_id, user_id, ip_address) VALUES ($1, $2, $3)"
        )
        .bind(story_id)
        .bind(auth.user_id)
        .bind(&ip_address)
        .execute(&pool)
        .await?;
        true
    } else {
        false
    };

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
