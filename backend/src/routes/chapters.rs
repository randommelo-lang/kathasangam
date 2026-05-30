use std::collections::HashMap;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::models::*;
use crate::errors::AppError;

async fn verify_story_owner_or_admin(
    pool: &PgPool,
    user_id: Uuid,
    story_id: Uuid,
) -> Result<(), AppError> {
    let row: Option<(Option<Uuid>,)> = sqlx::query_as("SELECT author_id FROM stories WHERE id = $1")
        .bind(story_id)
        .fetch_optional(pool)
        .await?;

    let story_author_id = row
        .ok_or_else(|| AppError::not_found("Story not found."))?
        .0;

    if story_author_id == Some(user_id) {
        return Ok(());
    }

    let role: Option<(String,)> = sqlx::query_as("SELECT role::text FROM profiles WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

    if let Some((r,)) = role {
        if r == "admin" {
            return Ok(());
        }
    }

    Err(AppError::forbidden("You do not have permission to manage chapters for this story."))
}

/// GET /api/stories/:story_id/chapters
pub async fn list_chapters(
    auth: Option<AuthUser>,
    State(pool): State<PgPool>,
    Path(story_id): Path<Uuid>,
) -> Result<Json<Vec<ChapterResponse>>, AppError> {
    let story: Option<(Option<Uuid>,)> = sqlx::query_as("SELECT author_id FROM stories WHERE id = $1")
        .bind(story_id)
        .fetch_optional(&pool)
        .await?;

    let story_author_id = story.and_then(|s| s.0);

    let mut show_all = false;
    if let Some(ref user) = auth {
        if Some(user.user_id) == story_author_id {
            show_all = true;
        }
    }

    let rows: Vec<ChapterRow> = if show_all {
        sqlx::query_as("SELECT * FROM chapters WHERE story_id = $1 ORDER BY sort_order")
            .bind(story_id)
            .fetch_all(&pool)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM chapters WHERE story_id = $1 AND status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= NOW()) ORDER BY sort_order")
            .bind(story_id)
            .fetch_all(&pool)
            .await?
    };

    let chapter_ids: Vec<Uuid> = rows.iter().map(|ch| ch.id).collect();
    if chapter_ids.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let content_fut = sqlx::query_as::<_, ContentRow>(
        "SELECT * FROM chapter_content WHERE chapter_id = ANY($1) ORDER BY sort_order",
    )
    .bind(&chapter_ids)
    .fetch_all(&pool);

    let pages_fut = sqlx::query_as::<_, PageRow>(
        "SELECT * FROM chapter_pages WHERE chapter_id = ANY($1) ORDER BY page_index",
    )
    .bind(&chapter_ids)
    .fetch_all(&pool);

    let comments_fut = sqlx::query_as::<_, (Uuid, Uuid, Option<Uuid>, String, String)>(
        "SELECT c.chapter_id, c.id, c.user_id, c.content, COALESCE(p.username, 'Reader') \
         FROM comments c \
         LEFT JOIN profiles p ON c.user_id = p.id \
         WHERE c.chapter_id = ANY($1) \
         ORDER BY c.created_at",
    )
    .bind(&chapter_ids)
    .fetch_all(&pool);

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

    let chapters = rows
        .iter()
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
        .collect();

    Ok(Json(chapters))
}

/// POST /api/stories/:story_id/chapters
pub async fn create_chapter(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(story_id): Path<Uuid>,
    Json(body): Json<CreateChapterRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    // Verify user is story owner or admin
    verify_story_owner_or_admin(&pool, auth.user_id, story_id).await?;

    // Get the next sort order
    let (max_order,): (i32,) =
        sqlx::query_as("SELECT COALESCE(MAX(sort_order), -1) FROM chapters WHERE story_id = $1")
            .bind(story_id)
            .fetch_one(&pool)
            .await?;

    let ch_id = Uuid::new_v4();
    let status = body.status.unwrap_or_else(|| "draft".to_string());
    let access = body.access.unwrap_or_else(|| "free".to_string());

    sqlx::query("INSERT INTO chapters (id, story_id, sort_order, title, status, access) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(ch_id).bind(story_id).bind(max_order + 1)
        .bind(&body.title).bind(&status).bind(&access)
        .execute(&pool).await?;

    if status == "published" {
        notify_followers(&pool, story_id, &body.title, max_order + 1).await;
    }

    // Add default content
    let content_id = Uuid::new_v4();
    sqlx::query("INSERT INTO chapter_content (id, chapter_id, sort_order, paragraph) VALUES ($1,$2,0,'Draft space ready for the next installment.')")
        .bind(content_id).bind(ch_id)
        .execute(&pool).await?;

    // Check if story is Chitrānk, add a default page
    let story_type: Option<(String,)> = sqlx::query_as("SELECT type FROM stories WHERE id = $1")
        .bind(story_id)
        .fetch_optional(&pool)
        .await?;

    if let Some((story_type,)) = story_type {
        if story_type == "Chitrānk" {
            let page_id = Uuid::new_v4();
            sqlx::query("INSERT INTO chapter_pages (id, chapter_id, page_index, label, bg) VALUES ($1,$2,0,'Draft page','linear-gradient(135deg, #263746, #287c76 52%, #f2d492)')")
                .bind(page_id).bind(ch_id)
                .execute(&pool).await?;
        }
    }

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": ch_id, "title": body.title })),
    ))
}

/// PATCH /api/chapters/:chapter_id/status
pub async fn toggle_chapter_status(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(chapter_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row: ChapterRow = sqlx::query_as("SELECT * FROM chapters WHERE id = $1")
        .bind(chapter_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::not_found("Chapter not found."))?;

    // Verify user is story owner or admin
    verify_story_owner_or_admin(&pool, auth.user_id, row.story_id).await?;

    let new_status = if row.status == "published" {
        "draft"
    } else {
        "published"
    };
    sqlx::query("UPDATE chapters SET status = $1 WHERE id = $2")
        .bind(new_status)
        .bind(chapter_id)
        .execute(&pool)
        .await?;

    if new_status == "published" {
        notify_followers(&pool, row.story_id, &row.title, row.sort_order).await;
    }

    Ok(Json(
        serde_json::json!({ "title": row.title, "status": new_status }),
    ))
}

/// DELETE /api/chapters/:chapter_id
pub async fn delete_chapter(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(chapter_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let row: ChapterRow = sqlx::query_as("SELECT * FROM chapters WHERE id = $1")
        .bind(chapter_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::not_found("Chapter not found."))?;

    // Verify user is story owner or admin
    verify_story_owner_or_admin(&pool, auth.user_id, row.story_id).await?;

    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM comments WHERE chapter_id = $1")
        .bind(chapter_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM chapter_content WHERE chapter_id = $1")
        .bind(chapter_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM chapter_pages WHERE chapter_id = $1")
        .bind(chapter_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM chapters WHERE id = $1")
        .bind(chapter_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

/// PUT /api/chapters/:chapter_id
pub async fn update_chapter(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(chapter_id): Path<Uuid>,
    Json(body): Json<UpdateChapterRequest>,
) -> Result<StatusCode, AppError> {
    let row: ChapterRow = sqlx::query_as("SELECT * FROM chapters WHERE id = $1")
        .bind(chapter_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::not_found("Chapter not found."))?;

    // Verify user is story owner or admin
    verify_story_owner_or_admin(&pool, auth.user_id, row.story_id).await?;

    let mut tx = pool.begin().await?;

    // Update chapter title and status if provided
    if let Some(ref status) = body.status {
        sqlx::query("UPDATE chapters SET title = $1, status = $2 WHERE id = $3")
            .bind(&body.title)
            .bind(&status)
            .bind(chapter_id)
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query("UPDATE chapters SET title = $1 WHERE id = $2")
            .bind(&body.title)
            .bind(chapter_id)
            .execute(&mut *tx)
            .await?;
    }

    // Delete old content
    sqlx::query("DELETE FROM chapter_content WHERE chapter_id = $1")
        .bind(chapter_id)
        .execute(&mut *tx)
        .await?;

    // Insert new paragraphs
    let mut total_words = 0;
    for (idx, para) in body.content.iter().enumerate() {
        total_words += para.split_whitespace().count() as i32;

        let content_id = Uuid::new_v4();
        sqlx::query("INSERT INTO chapter_content (id, chapter_id, sort_order, paragraph) VALUES ($1, $2, $3, $4)")
            .bind(content_id)
            .bind(chapter_id)
            .bind(idx as i32)
            .bind(para)
            .execute(&mut *tx)
            .await?;
    }

    // Update chapter word count
    sqlx::query("UPDATE chapters SET words = $1 WHERE id = $2")
        .bind(total_words)
        .bind(chapter_id)
        .execute(&mut *tx)
        .await?;

    let should_notify = body.status.as_deref() == Some("published") && row.status != "published";

    tx.commit().await?;

    if should_notify {
        notify_followers(&pool, row.story_id, &body.title, row.sort_order).await;
    }

    Ok(StatusCode::OK)
}

async fn notify_followers(
    pool: &PgPool,
    story_id: Uuid,
    chapter_title: &str,
    chapter_sort_order: i32,
) {
    let story_info: Option<(String,)> = sqlx::query_as("SELECT title FROM stories WHERE id = $1")
        .bind(story_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    let story_title = story_info.map(|s| s.0).unwrap_or_else(|| "a followed story".to_string());
    let message = format!("New chapter '{}' published for '{}'", chapter_title, story_title);

    let result = sqlx::query(
        "INSERT INTO notifications (user_id, message, story_id, chapter_sort_order) \
         SELECT l.user_id, $1, $2, $3 \
         FROM library l \
         JOIN profiles p ON l.user_id = p.id \
         WHERE l.story_id = $2 AND (COALESCE(p.preferences->>'in_app_notifications', 'true'))::boolean = true"
    )
    .bind(&message)
    .bind(story_id)
    .bind(chapter_sort_order)
    .execute(pool)
    .await;

    if let Err(e) = result {
        tracing::error!("Failed to notify followers for story {}: {:?}", story_id, e);
    }
}

