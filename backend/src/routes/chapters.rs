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

async fn verify_story_owner_or_admin(
    pool: &PgPool,
    user_id: Uuid,
    story_id: Uuid,
) -> Result<(), StatusCode> {
    let row: Option<(Option<Uuid>,)> = sqlx::query_as("SELECT author_id FROM stories WHERE id = $1")
        .bind(story_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            eprintln!("Database error fetching story: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let story_author_id = row
        .ok_or(StatusCode::NOT_FOUND)?
        .0;

    if story_author_id == Some(user_id) {
        return Ok(());
    }

    let role: Option<(String,)> = sqlx::query_as("SELECT role::text FROM profiles WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            eprintln!("Database error checking user role: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if let Some((r,)) = role {
        if r == "admin" {
            return Ok(());
        }
    }

    Err(StatusCode::FORBIDDEN)
}

/// GET /api/stories/:story_id/chapters
pub async fn list_chapters(
    auth: Option<AuthUser>,
    State(pool): State<PgPool>,
    Path(story_id): Path<Uuid>,
) -> Result<Json<Vec<ChapterResponse>>, StatusCode> {
    let story: Option<(Option<Uuid>,)> = sqlx::query_as("SELECT author_id FROM stories WHERE id = $1")
        .bind(story_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

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
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        sqlx::query_as("SELECT * FROM chapters WHERE story_id = $1 AND status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= NOW()) ORDER BY sort_order")
            .bind(story_id)
            .fetch_all(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
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
        tokio::try_join!(content_fut, pages_fut, comments_fut)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

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
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    // Verify user is story owner or admin
    verify_story_owner_or_admin(&pool, auth.user_id, story_id).await?;

    // Get the next sort order
    let (max_order,): (i32,) =
        sqlx::query_as("SELECT COALESCE(MAX(sort_order), -1) FROM chapters WHERE story_id = $1")
            .bind(story_id)
            .fetch_one(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let ch_id = Uuid::new_v4();
    let status = body.status.unwrap_or_else(|| "draft".to_string());
    let access = body.access.unwrap_or_else(|| "free".to_string());

    sqlx::query("INSERT INTO chapters (id, story_id, sort_order, title, status, access) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(ch_id).bind(story_id).bind(max_order + 1)
        .bind(&body.title).bind(&status).bind(&access)
        .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Add default content
    let content_id = Uuid::new_v4();
    sqlx::query("INSERT INTO chapter_content (id, chapter_id, sort_order, paragraph) VALUES ($1,$2,0,'Draft space ready for the next installment.')")
        .bind(content_id).bind(ch_id)
        .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Check if story is Chitrānk, add a default page
    let story_type: Option<(String,)> = sqlx::query_as("SELECT type FROM stories WHERE id = $1")
        .bind(story_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some((story_type,)) = story_type {
        if story_type == "Chitrānk" {
            let page_id = Uuid::new_v4();
            sqlx::query("INSERT INTO chapter_pages (id, chapter_id, page_index, label, bg) VALUES ($1,$2,0,'Draft page','linear-gradient(135deg, #263746, #287c76 52%, #f2d492)')")
                .bind(page_id).bind(ch_id)
                .execute(&pool).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
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
) -> Result<Json<serde_json::Value>, StatusCode> {
    let row: ChapterRow = sqlx::query_as("SELECT * FROM chapters WHERE id = $1")
        .bind(chapter_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

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
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(
        serde_json::json!({ "title": row.title, "status": new_status }),
    ))
}

/// DELETE /api/chapters/:chapter_id
pub async fn delete_chapter(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(chapter_id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    let row: ChapterRow = sqlx::query_as("SELECT * FROM chapters WHERE id = $1")
        .bind(chapter_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Verify user is story owner or admin
    verify_story_owner_or_admin(&pool, auth.user_id, row.story_id).await?;

    let mut tx = pool.begin().await.map_err(|e| {
        eprintln!("Failed to start transaction: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    sqlx::query("DELETE FROM comments WHERE chapter_id = $1")
        .bind(chapter_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("Failed to delete comments: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    sqlx::query("DELETE FROM chapter_content WHERE chapter_id = $1")
        .bind(chapter_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("Failed to delete chapter content: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    sqlx::query("DELETE FROM chapter_pages WHERE chapter_id = $1")
        .bind(chapter_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("Failed to delete chapter pages: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    sqlx::query("DELETE FROM chapters WHERE id = $1")
        .bind(chapter_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            eprintln!("Failed to delete chapter: {:?}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    tx.commit().await.map_err(|e| {
        eprintln!("Failed to commit transaction: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::NO_CONTENT)
}
