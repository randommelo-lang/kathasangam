use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

// ── Story ──

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct StoryRow {
    pub id: Uuid,
    pub author_id: Option<Uuid>,
    pub author_name: String,
    pub title: String,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub story_type: String,
    pub genre: String,
    pub language: String,
    pub license: String,
    pub status: String,
    pub tags: Value,
    pub description: String,
    pub cover: String,
    pub followers: i32,
    pub views: i32,
    pub likes: i32,
    pub earnings: i32,
    pub progress: i32,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct StoryModel {
    pub id: Uuid,

    pub author_id: Option<Uuid>,

    pub title: String,

    pub description: String,

    pub cover: String,

    pub created_at: NaiveDateTime,
}

#[derive(Debug, Serialize, Clone)]
pub struct StoryResponse {
    pub id: Uuid,
    pub author_id: Option<Uuid>,
    pub title: String,
    pub author: String,
    #[serde(rename = "type")]
    pub story_type: String,
    pub genre: String,
    pub language: String,
    pub license: String,
    pub status: String,
    pub tags: Vec<String>,
    pub description: String,
    pub cover: String,
    pub followers: i32,
    pub views: i32,
    pub likes: i32,
    pub earnings: i32,
    pub progress: i32,
    pub chapters: Vec<ChapterResponse>,
}

#[derive(Debug, Deserialize)]
pub struct CreateStoryRequest {
    pub title: String,
    #[serde(rename = "type")]
    pub story_type: String,
    pub genre: String,
    pub description: String,
    pub cover: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StoryQuery {
    pub q: Option<String>,
    pub genre: Option<String>,
    #[serde(rename = "type")]
    pub story_type: Option<String>,
}

// ── Chapter ──

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct ChapterRow {
    pub id: Uuid,
    pub story_id: Uuid,
    pub sort_order: i32,
    pub title: String,
    pub status: String,
    pub access: String,
    pub scheduled_at: Option<NaiveDateTime>,
    pub words: i32,
    pub reads: i32,
    pub likes: i32,
}

#[derive(Debug, Serialize, Clone)]
pub struct ChapterResponse {
    pub id: Uuid,
    pub sort_order: i32,
    pub title: String,
    pub status: String,
    pub access: String,
    #[serde(rename = "scheduledAt", skip_serializing_if = "Option::is_none")]
    pub scheduled_at: Option<NaiveDateTime>,
    pub words: i32,
    pub reads: i32,
    pub likes: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pages: Option<Vec<PageResponse>>,
    pub comments: Vec<CommentResponse>,
}

#[derive(Debug, Deserialize)]
pub struct CreateChapterRequest {
    pub title: String,
    pub status: Option<String>,
    pub access: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChapterRequest {
    pub title: String,
    pub content: Vec<String>,
    pub status: Option<String>,
}

// ── Chapter content / pages ──

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct ContentRow {
    pub id: Uuid,
    pub chapter_id: Uuid,
    pub sort_order: i32,
    pub paragraph: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct PageRow {
    pub id: Uuid,
    pub chapter_id: Uuid,
    pub page_index: i32,
    pub label: String,
    pub bg: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct PageResponse {
    pub label: String,
    pub bg: String,
}

// ── Comment ──

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct CommentRow {
    pub id: Uuid,
    pub chapter_id: Uuid,
    pub user_id: Option<Uuid>,
    pub content: String,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Serialize, Clone)]
pub struct CommentResponse {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub user: String,
    pub text: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub user: String,
    pub text: String,
}

// ── Report ──

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct ReportRow {
    pub id: Uuid,
    pub reporter_id: Option<Uuid>,
    pub target_type: String,
    pub target_id: Uuid,
    pub reason: String,
    pub status: String,
    pub severity: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReportRequest {
    pub status: String, // "resolved" or "escalated"
}

// ── Notification ──

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct NotificationRow {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub message: String,
    pub is_read: bool,
}

// ── Library ──

#[derive(Debug, Deserialize)]
pub struct FollowRequest {
    pub story_id: Uuid,
}

// ── Tip ──

#[derive(Debug, Deserialize)]
pub struct TipRequest {
    pub amount: Option<i32>,
}

// ── Stats ──

#[derive(Debug, Serialize)]
pub struct StatsResponse {
    pub published: i64,
    pub views: i64,
    pub followers: i64,
    pub open_reports: i64,
}

// ── Image upload response ──

#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub url: String,
}

// ── Audit Log ──

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct AuditLogRow {
    pub id: Uuid,
    pub moderator_id: Uuid,
    pub moderator_name: Option<String>,
    pub action: String,
    pub target_type: String,
    pub target_id: Uuid,
    pub details: Value,
    pub created_at: NaiveDateTime,
}

