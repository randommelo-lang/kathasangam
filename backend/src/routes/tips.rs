use crate::models::*;
use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::errors::AppError;

const DEFAULT_TIP_AMOUNT: i32 = 5;
const MIN_TIP_AMOUNT: i32 = 1;
const MAX_TIP_AMOUNT: i32 = 10_000;

/// POST /api/stories/:id/tip
pub async fn tip_story(
    State(pool): State<PgPool>,
    AuthUser { user_id, .. }: AuthUser,
    Path(story_id): Path<Uuid>,
    Json(body): Json<TipRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // SB-13: `amount` was an unvalidated Option<i32> applied straight to
    // `stories.earnings`, and the `tips.amount` column has no CHECK constraint, so a
    // negative body value decremented author earnings and arbitrarily large values
    // inflated them without limit. Bounded here; the schema constraint follows in
    // migrations/0025_tip_amount_bounds.sql.
    let amount = body.amount.unwrap_or(DEFAULT_TIP_AMOUNT);
    if !(MIN_TIP_AMOUNT..=MAX_TIP_AMOUNT).contains(&amount) {
        return Err(AppError::bad_request(format!(
            "Tip amount must be between {} and {}.",
            MIN_TIP_AMOUNT, MAX_TIP_AMOUNT
        )));
    }

    // The story must exist and must be published before it can receive tips.
    let story_status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM stories WHERE id = $1"
    )
    .bind(story_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::not_found("Story not found."))?;

    if story_status.to_lowercase() == "draft" {
        return Err(AppError::bad_request("Tips are only accepted for published stories."));
    }

    let tip_id = Uuid::new_v4();
    sqlx::query("INSERT INTO tips (id, story_id, user_id, amount) VALUES ($1, $2, $3, $4)")
        .bind(tip_id)
        .bind(story_id)
        .bind(user_id)
        .bind(amount)
        .execute(&pool)
        .await?;
    sqlx::query("UPDATE stories SET earnings = earnings + $1 WHERE id = $2")
        .bind(amount)
        .bind(story_id)
        .execute(&pool)
        .await?;
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT COALESCE(profiles.username, 'the author')
         FROM stories
         LEFT JOIN profiles ON profiles.id = stories.author_id
         WHERE stories.id = $1",
    )
    .bind(story_id)
    .fetch_optional(&pool)
    .await?;
    let author = row
        .map(|(a,)| a)
        .unwrap_or_else(|| "the author".to_string());
    Ok(Json(
        serde_json::json!({ "message": format!("Demo tip sent to {}.", author) }),
    ))
}
