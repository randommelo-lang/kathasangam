use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::models::{DirectMessageRow, SendMessageRequest, ConversationSummary};
use crate::errors::AppError;

/// GET /api/messages – List conversations for the logged in user
pub async fn list_conversations(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<ConversationSummary>>, AppError> {
    let rows = sqlx::query_as::<_, ConversationSummary>(
        "WITH latest_messages AS ( \
            SELECT DISTINCT ON ( \
                CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END \
            ) \
                id, \
                sender_id, \
                receiver_id, \
                content, \
                created_at \
            FROM public.direct_messages \
            WHERE sender_id = $1 OR receiver_id = $1 \
            ORDER BY \
                CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END, \
                created_at DESC \
        ) \
        SELECT \
            other.id as other_user_id, \
            other.username as other_username, \
            other.avatar_url as other_avatar_url, \
            lm.content as last_message, \
            lm.created_at as last_message_at \
        FROM latest_messages lm \
        JOIN public.profiles other ON other.id = (CASE WHEN lm.sender_id = $1 THEN lm.receiver_id ELSE lm.sender_id END) \
        ORDER BY lm.created_at DESC"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

/// GET /api/messages/:user_id – Message history with user_id
pub async fn get_message_history(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(other_id): Path<Uuid>,
) -> Result<Json<Vec<DirectMessageRow>>, AppError> {
    let rows = sqlx::query_as::<_, DirectMessageRow>(
        "SELECT \
            dm.id, \
            dm.sender_id, \
            s.username AS sender_name, \
            dm.receiver_id, \
            r.username AS receiver_name, \
            dm.content, \
            dm.created_at \
        FROM public.direct_messages dm \
        JOIN public.profiles s ON dm.sender_id = s.id \
        JOIN public.profiles r ON dm.receiver_id = r.id \
        WHERE (dm.sender_id = $1 AND dm.receiver_id = $2) \
           OR (dm.sender_id = $2 AND dm.receiver_id = $1) \
        ORDER BY dm.created_at ASC"
    )
    .bind(auth.user_id)
    .bind(other_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

/// POST /api/messages – Send a direct message
pub async fn send_message(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Json(body): Json<SendMessageRequest>,
) -> Result<(StatusCode, Json<DirectMessageRow>), AppError> {
    if body.content.trim().is_empty() {
        return Err(AppError::bad_request("Message content cannot be empty."));
    }

    if auth.user_id == body.receiver_id {
        return Err(AppError::bad_request("You cannot send a message to yourself."));
    }

    // Verify receiver profile exists
    let receiver_exists: (bool,) = sqlx::query_as("SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = $1)")
        .bind(body.receiver_id)
        .fetch_one(&pool)
        .await?;
    
    if !receiver_exists.0 {
        return Err(AppError::not_found("Recipient user profile not found."));
    }

    let message = sqlx::query_as::<_, DirectMessageRow>(
        "WITH inserted AS ( \
            INSERT INTO public.direct_messages (sender_id, receiver_id, content) \
            VALUES ($1, $2, $3) \
            RETURNING id, sender_id, receiver_id, content, created_at \
        ) \
        SELECT \
            i.id, \
            i.sender_id, \
            s.username as sender_name, \
            i.receiver_id, \
            r.username as receiver_name, \
            i.content, \
            i.created_at \
        FROM inserted i \
        JOIN public.profiles s ON i.sender_id = s.id \
        JOIN public.profiles r ON i.receiver_id = r.id"
    )
    .bind(auth.user_id)
    .bind(body.receiver_id)
    .bind(body.content.trim())
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(message)))
}
