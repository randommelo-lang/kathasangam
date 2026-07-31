use std::collections::HashMap;

use axum::{
    extract::{Path, State, Query},
    http::{StatusCode, HeaderMap},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;
use chrono::NaiveDateTime;

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

    // Check if user is accepted collaborator
    let collab_exists: (bool,) = sqlx::query_as(
        "SELECT EXISTS(SELECT 1 FROM story_collaborators WHERE story_id = $1 AND user_id = $2 AND status = 'accepted')"
    )
    .bind(story_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if collab_exists.0 {
        return Ok(());
    }

    let role: Option<(String,)> = sqlx::query_as("SELECT role::text FROM profiles WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

    if let Some((r,)) = role {
        if r == "admin" || r == "moderator" {
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

    let comments_fut = sqlx::query_as::<_, (Uuid, Uuid, Option<Uuid>, String, String, Option<i32>, Option<Uuid>)>(
        "SELECT c.chapter_id, c.id, c.user_id, c.content, COALESCE(p.username, 'Reader'), c.paragraph_index, c.parent_id \
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
    let mut comment_map: HashMap<Uuid, Vec<(Uuid, Option<Uuid>, String, String, Option<i32>, Option<Uuid>)>> =
        HashMap::new();
    for (chapter_id, id, user_id, text, username, paragraph_index, parent_id) in all_comments {
        comment_map
            .entry(chapter_id)
            .or_default()
            .push((id, user_id, text, username, paragraph_index, parent_id));
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
                .map(|(id, user_id, text, username, paragraph_index, parent_id)| CommentResponse {
                    id,
                    user_id,
                    user: username,
                    text,
                    paragraph_index,
                    parent_id,
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
        .collect();

    Ok(Json(chapters))
}

pub async fn create_chapter(
    auth: AuthUser,
    headers: HeaderMap,
    State(pool): State<PgPool>,
    Path(story_id): Path<Uuid>,
    Json(body): Json<CreateChapterRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    // Geolocalized country restriction
    if let Some(cf_country) = headers.get("cf-ipcountry").and_then(|v| v.to_str().ok()) {
        let country_code = cf_country.to_uppercase();
        if !country_code.is_empty() && country_code != "IN" {
            return Err(AppError::forbidden("Chapter creation is only allowed for users located in India."));
        }
    }

    // Verify user is story owner or admin
    verify_story_owner_or_admin(&pool, auth.user_id, story_id).await?;

    // Get the next sort order
    let (max_order,): (i32,) =
        sqlx::query_as("SELECT COALESCE(MAX(sort_order), -1) FROM chapters WHERE story_id = $1")
            .bind(story_id)
            .fetch_one(&pool)
            .await?;

    let ch_id = Uuid::new_v4();
    let mut status = body.status.unwrap_or_else(|| "draft".to_string());
    let access = body.access.unwrap_or_else(|| "free".to_string());

    // Parse optional scheduled_at
    let scheduled_at: Option<NaiveDateTime> = match &body.scheduled_at {
        Some(s) if !s.is_empty() => {
            let parsed = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
                .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M"))
                .map_err(|_| AppError::bad_request("Invalid scheduledAt format. Use ISO 8601 (e.g. 2026-07-15T10:00:00)."))?;
            status = "scheduled".to_string();
            Some(parsed)
        }
        _ => None,
    };

    sqlx::query("INSERT INTO chapters (id, story_id, sort_order, title, status, access, scheduled_at) VALUES ($1,$2,$3,$4,$5,$6,$7)")
        .bind(ch_id).bind(story_id).bind(max_order + 1)
        .bind(&body.title).bind(&status).bind(&access).bind(scheduled_at)
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

    let (new_status, clear_schedule) = match row.status.as_str() {
        "published" => ("draft", false),
        "scheduled" => ("draft", true),   // Cancel schedule → revert to draft
        _ => ("published", true),          // draft → published (clear any leftover scheduled_at)
    };

    if clear_schedule {
        sqlx::query("UPDATE chapters SET status = $1, scheduled_at = NULL WHERE id = $2")
            .bind(new_status)
            .bind(chapter_id)
            .execute(&pool)
            .await?;
    } else {
        sqlx::query("UPDATE chapters SET status = $1 WHERE id = $2")
            .bind(new_status)
            .bind(chapter_id)
            .execute(&pool)
            .await?;
    }

    if new_status == "published" {
        let _ = sqlx::query("UPDATE stories SET status = 'ongoing' WHERE id = $1 AND (status = 'draft' OR status = 'unpublished')")
            .bind(row.story_id)
            .execute(&pool)
            .await;

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
    Query(query): Query<DeleteQuery>,
) -> Result<StatusCode, AppError> {
    let row: ChapterRow = sqlx::query_as("SELECT * FROM chapters WHERE id = $1")
        .bind(chapter_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::not_found("Chapter not found."))?;

    // Verify user is story owner or staff (admin/moderator)
    verify_story_owner_or_admin(&pool, auth.user_id, row.story_id).await?;

    // Retrieve story info to check if moderation action
    let story_row: Option<(Option<Uuid>, Option<String>)> = sqlx::query_as("SELECT author_id, title FROM stories WHERE id = $1")
        .bind(row.story_id)
        .fetch_optional(&pool)
        .await?;
    let (story_author_id, story_title) = story_row.unwrap_or((None, None));

    let is_moderation_action = story_author_id != Some(auth.user_id);

    let mut tx = pool.begin().await?;

    if is_moderation_action {
        let role_opt: Option<(String,)> = sqlx::query_as("SELECT role::text FROM profiles WHERE id = $1")
            .bind(auth.user_id)
            .fetch_optional(&pool)
            .await?;
        let user_role = role_opt.map(|(r,)| r).unwrap_or_else(|| "moderator".to_string());
        let action_name = if user_role == "admin" { "delete_chapter_by_admin" } else { "delete_chapter_by_moderator" };
        let details = serde_json::json!({
            "chapter_title": row.title,
            "story_id": row.story_id,
            "story_title": story_title,
            "is_moderation": true
        });
        sqlx::query(
            "INSERT INTO moderation_audit_logs (moderator_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)"
        )
        .bind(auth.user_id)
        .bind(action_name)
        .bind("chapter")
        .bind(chapter_id)
        .bind(&details)
        .execute(&mut *tx)
        .await?;

        if let Some(author_id) = story_author_id {
            let reason_str = query.reason.as_deref().unwrap_or("No reason specified");
            let st_title = story_title.as_deref().unwrap_or("your story");
            let message = format!("Your chapter '{}' under story '{}' was removed by a moderator. Reason: {}", row.title, st_title, reason_str);
            let _ = sqlx::query(
                "INSERT INTO notifications (user_id, message) VALUES ($1, $2)"
            )
            .bind(author_id)
            .bind(&message)
            .execute(&mut *tx)
            .await;
        }
    }

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

    // Handle scheduled_at field
    let parsed_scheduled_at: Option<NaiveDateTime> = match &body.scheduled_at {
        Some(s) if !s.is_empty() => {
            let parsed = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
                .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M"))
                .map_err(|_| AppError::bad_request("Invalid scheduledAt format. Use ISO 8601."))?;
            Some(parsed)
        }
        Some(_) => None,  // Empty string means clear schedule
        None => None,      // Not provided means no change
    };

    // Determine effective status
    let effective_status: Option<String> = if body.scheduled_at.as_deref() == Some("") {
        // Clear schedule → revert to draft
        Some("draft".to_string())
    } else if parsed_scheduled_at.is_some() {
        // Setting a schedule
        Some("scheduled".to_string())
    } else {
        body.status.clone()
    };

    // Update chapter title, status, and scheduled_at
    if let Some(ref status) = effective_status {
        if parsed_scheduled_at.is_some() {
            sqlx::query("UPDATE chapters SET title = $1, status = $2, scheduled_at = $3 WHERE id = $4")
                .bind(&body.title)
                .bind(status)
                .bind(parsed_scheduled_at)
                .bind(chapter_id)
                .execute(&mut *tx)
                .await?;
        } else if body.scheduled_at.as_deref() == Some("") {
            sqlx::query("UPDATE chapters SET title = $1, status = $2, scheduled_at = NULL WHERE id = $3")
                .bind(&body.title)
                .bind(status)
                .bind(chapter_id)
                .execute(&mut *tx)
                .await?;
        } else {
            sqlx::query("UPDATE chapters SET title = $1, status = $2 WHERE id = $3")
                .bind(&body.title)
                .bind(status)
                .bind(chapter_id)
                .execute(&mut *tx)
                .await?;
        }
    } else {
        sqlx::query("UPDATE chapters SET title = $1 WHERE id = $2")
            .bind(&body.title)
            .bind(chapter_id)
            .execute(&mut *tx)
            .await?;
    }

    // Delete old content / pages based on story type
    let (story_type,): (String,) = sqlx::query_as("SELECT type FROM stories WHERE id = $1")
        .bind(row.story_id)
        .fetch_one(&mut *tx)
        .await?;

    if story_type == "Chitrānk" {
        // Delete old pages
        sqlx::query("DELETE FROM chapter_pages WHERE chapter_id = $1")
            .bind(chapter_id)
            .execute(&mut *tx)
            .await?;

        // Insert new pages if provided
        if let Some(ref pages) = body.pages {
            for (idx, page) in pages.iter().enumerate() {
                let page_id = Uuid::new_v4();
                sqlx::query("INSERT INTO chapter_pages (id, chapter_id, page_index, label, bg) VALUES ($1, $2, $3, $4, $5)")
                    .bind(page_id)
                    .bind(chapter_id)
                    .bind(idx as i32)
                    .bind(&page.label)
                    .bind(&page.bg)
                    .execute(&mut *tx)
                    .await?;
            }
        }

        // Update words count to 0 for comic chapters
        sqlx::query("UPDATE chapters SET words = 0 WHERE id = $1")
            .bind(chapter_id)
            .execute(&mut *tx)
            .await?;
    } else {
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
    }

    let should_notify = effective_status.as_deref() == Some("published") && row.status != "published";

    tx.commit().await?;

    if should_notify {
        let _ = sqlx::query("UPDATE stories SET status = 'ongoing' WHERE id = $1 AND (status = 'draft' OR status = 'unpublished')")
            .bind(row.story_id)
            .execute(&pool)
            .await;

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
         SELECT DISTINCT target_users.user_id, $1, $2, $3 \
         FROM ( \
             SELECT user_id FROM public.bookmarks WHERE story_id = $2 \
             UNION \
             SELECT user_id FROM public.library WHERE story_id = $2 \
         ) AS target_users \
         JOIN public.profiles p ON target_users.user_id = p.id \
         JOIN public.stories s ON s.id = $2 \
         WHERE target_users.user_id != s.author_id \
           AND (COALESCE(p.preferences->>'in_app_notifications', 'true'))::boolean = true"
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

/// GET /api/chapters/scheduled
pub async fn list_scheduled_chapters(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let rows: Vec<(Uuid, Uuid, String, String, NaiveDateTime, i32)> = sqlx::query_as(
        "SELECT c.id, c.story_id, c.title, s.title, c.scheduled_at, c.sort_order \
         FROM chapters c \
         JOIN stories s ON c.story_id = s.id \
         WHERE s.author_id = $1 AND c.status = 'scheduled' AND c.scheduled_at IS NOT NULL \
         ORDER BY c.scheduled_at ASC"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await?;

    let result: Vec<serde_json::Value> = rows.iter().map(|r| {
        serde_json::json!({
            "id": r.0,
            "storyId": r.1,
            "title": r.2,
            "storyTitle": r.3,
            "scheduledAt": r.4.format("%Y-%m-%dT%H:%M:%S").to_string(),
            "sortOrder": r.5
        })
    }).collect();

    Ok(Json(result))
}

