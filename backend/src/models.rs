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
    pub is_nsfw: bool,
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
    pub created_at: NaiveDateTime,
    pub chapters: Vec<ChapterResponse>,
    pub collaborators: Vec<CollaboratorResponse>,
    #[serde(rename = "isNsfw")]
    pub is_nsfw: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateStoryRequest {
    pub title: String,
    #[serde(rename = "type")]
    pub story_type: String,
    pub genre: String,
    pub language: Option<String>,
    pub description: String,
    pub cover: Option<String>,
    #[serde(rename = "isNsfw")]
    pub is_nsfw: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateStoryRequest {
    pub title: Option<String>,
    pub genre: Option<String>,
    pub description: Option<String>,
    pub cover: Option<String>,
    pub status: Option<String>,
    pub language: Option<String>,
    pub license: Option<String>,
    pub tags: Option<Vec<String>>,
    #[serde(rename = "isNsfw")]
    pub is_nsfw: Option<bool>,
}


#[derive(Debug, Deserialize)]
pub struct StoryQuery {
    pub q: Option<String>,
    pub genre: Option<String>,
    #[serde(rename = "type")]
    pub story_type: Option<String>,
    pub status: Option<String>,
    pub language: Option<String>,
    pub sort_by: Option<String>,
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
    pub created_at: Option<NaiveDateTime>,
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
    #[serde(rename = "createdAt", skip_serializing_if = "Option::is_none")]
    pub created_at: Option<NaiveDateTime>,
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
    #[serde(rename = "scheduledAt")]
    pub scheduled_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChapterRequest {
    pub title: String,
    pub content: Vec<String>,
    pub status: Option<String>,
    pub pages: Option<Vec<PageResponse>>,
    #[serde(rename = "scheduledAt")]
    pub scheduled_at: Option<String>,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PageResponse {
    pub label: String,
    pub bg: String,
}

// ── Comment ──

#[derive(Debug, Serialize, Clone)]
pub struct CommentResponse {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub user: String,
    pub text: String,
    #[serde(rename = "paragraphIndex")]
    pub paragraph_index: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub text: String,
    #[serde(rename = "paragraphIndex")]
    pub paragraph_index: Option<i32>,
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

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct GroupedReportRow {
    pub id: Uuid,
    pub reporter_id: Option<Uuid>,
    pub target_type: String,
    pub target_id: Uuid,
    pub reason: String,
    pub status: String,
    pub severity: String,
    pub report_count: i64,
    pub reporter_username: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReportRequest {
    pub status: String, // "resolved" or "escalated"
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BulkUpdateReportsRequest {
    pub ids: Vec<Uuid>,
    pub status: String, // "resolved" or "escalated"
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReportRequest {
    pub target_type: String, // "story", "chapter", "comment"
    pub target_id: Uuid,
    pub reason: String,
    pub severity: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReportSeverityRequest {
    pub severity: String,
}

#[derive(Debug, Deserialize)]
pub struct BanUserRequest {
    pub user_id: Uuid,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteQuery {
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse<T> {
    pub items: Vec<T>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
pub struct ReportQuery {
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub search: Option<String>,
    pub sort: Option<String>,
    pub target_type: Option<String>,
    pub severity: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AuditLogQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub moderator_id: Option<uuid::Uuid>,
    pub action: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TextScanReportDetail {
    pub report_id: Uuid,
    pub target_type: String,
    pub target_id: Uuid,
    pub matched_term: String,
}

#[derive(Debug, Serialize)]
pub struct TextScanResult {
    pub reports_scanned: i64,
    pub reports_escalated: i64,
    pub details: Vec<TextScanReportDetail>,
}

// ── Notification ──

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct NotificationRow {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub message: String,
    pub is_read: bool,
    pub story_id: Option<Uuid>,
    pub chapter_sort_order: Option<i32>,
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

// ── Reading Progress ──

#[derive(Debug, Serialize, sqlx::FromRow, Clone)]
pub struct ReadingProgressRow {
    pub story_id: Uuid,
    pub chapter_id: Uuid,
    pub page_index: i32,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProgressRequest {
    pub story_id: Uuid,
    pub chapter_id: Uuid,
    pub page_index: i32,
}

// ── Direct Messages ──

#[derive(Debug, Serialize, sqlx::FromRow, Clone)]
pub struct DirectMessageRow {
    pub id: Uuid,
    pub sender_id: Uuid,
    pub sender_name: Option<String>,
    pub receiver_id: Uuid,
    pub receiver_name: Option<String>,
    pub content: String,
    pub created_at: NaiveDateTime,
    pub is_read: bool,
}

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub receiver_id: Uuid,
    pub content: String,
}

#[derive(Debug, Serialize, sqlx::FromRow, Clone)]
pub struct ConversationSummary {
    pub other_user_id: Uuid,
    pub other_username: String,
    pub other_avatar_url: Option<String>,
    pub last_message: String,
    pub last_message_at: NaiveDateTime,
    pub unread_count: i64,
}

// ── Bookmarks ──

#[derive(Debug, Deserialize)]
pub struct BookmarkRequest {
    pub story_id: Uuid,
}

// ── Reading Lists ──

#[derive(Debug, Serialize, sqlx::FromRow, Clone)]
pub struct ReadingListRow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub username: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub is_private: bool,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreateReadingListRequest {
    pub name: String,
    pub description: Option<String>,
    pub is_private: bool,
}

#[derive(Debug, Deserialize)]
pub struct AddListEntryRequest {
    pub story_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct ReadingListDetailResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub username: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub is_private: bool,
    pub created_at: NaiveDateTime,
    pub stories: Vec<StoryResponse>,
}

// ── Collaborative Co-Authoring ──

#[derive(Debug, Serialize, Clone)]
pub struct CollaboratorResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub username: String,
    pub avatar_url: String,
    pub role: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct InviteCollaboratorRequest {
    pub username: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct RespondInviteRequest {
    pub action: String, // "accept" or "decline"
}

#[derive(Debug, Deserialize)]
pub struct CreateInternalNoteRequest {
    #[serde(rename = "chapterId")]
    pub chapter_id: Option<Uuid>,
    pub content: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct InternalNoteResponse {
    pub id: Uuid,
    pub story_id: Uuid,
    #[serde(rename = "chapterId")]
    pub chapter_id: Option<Uuid>,
    #[serde(rename = "authorId")]
    pub author_id: Uuid,
    #[serde(rename = "authorName")]
    pub author_name: String,
    #[serde(rename = "authorAvatar")]
    pub author_avatar: String,
    pub content: String,
    #[serde(rename = "createdAt")]
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Serialize, Clone)]
pub struct PendingInviteResponse {
    #[serde(rename = "collaborationId")]
    pub collaboration_id: Uuid,
    #[serde(rename = "storyId")]
    pub story_id: Uuid,
    #[serde(rename = "storyTitle")]
    pub story_title: String,
    #[serde(rename = "ownerUsername")]
    pub owner_username: String,
    pub role: String,
    pub status: String,
}
