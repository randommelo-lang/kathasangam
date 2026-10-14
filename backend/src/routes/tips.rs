use axum::{
    extract::{Path, State},
    Json,
};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::{AuthUser, OptionalAuthUser};
use crate::errors::AppError;
use crate::models::*;

type HmacSha256 = Hmac<Sha256>;

const MIN_TIP_AMOUNT: i32 = 10;     // Min ₹10
const MAX_TIP_AMOUNT: i32 = 10_000; // Max ₹10,000

/// POST /api/stories/:id/tip/order
/// Creates a Razorpay order for reader tipping.
pub async fn create_tip_order(
    State(pool): State<PgPool>,
    auth: OptionalAuthUser,
    Path(story_id): Path<Uuid>,
    Json(body): Json<CreateTipOrderRequest>,
) -> Result<Json<CreateTipOrderResponse>, AppError> {
    if body.amount < MIN_TIP_AMOUNT || body.amount > MAX_TIP_AMOUNT {
        return Err(AppError::bad_request(format!(
            "Tip amount must be between ₹{} and ₹{}.",
            MIN_TIP_AMOUNT, MAX_TIP_AMOUNT
        )));
    }

    // Story must exist, be published, and have an author
    let story: Option<(String, String, Option<Uuid>, Option<String>)> = sqlx::query_as(
        "SELECT stories.title, stories.status, stories.author_id, profiles.username
         FROM stories
         LEFT JOIN profiles ON profiles.id = stories.author_id
         WHERE stories.id = $1",
    )
    .bind(story_id)
    .fetch_optional(&pool)
    .await?;

    let (story_title, story_status, author_id_opt, author_username) = story
        .ok_or_else(|| AppError::not_found("Story not found."))?;

    if story_status.to_lowercase() == "draft" {
        return Err(AppError::bad_request("Tips are only accepted for published stories."));
    }

    let author_id = author_id_opt
        .ok_or_else(|| AppError::bad_request("This story has no associated author profile."))?;

    // Disallow self-tipping if author is logged in
    if let Some(user_id) = auth.user_id {
        if user_id == author_id {
            return Err(AppError::bad_request("You cannot tip your own story."));
        }
    }

    let tip_id = Uuid::new_v4();
    let amount_paise = (body.amount as i64) * 100;
    let key_id = std::env::var("RAZORPAY_KEY_ID").unwrap_or_default();
    let key_secret = std::env::var("RAZORPAY_KEY_SECRET").unwrap_or_default();

    // Call Razorpay REST API if real or valid test keys are configured
    let rzp_order_id = if !key_id.is_empty()
        && !key_secret.is_empty()
        && key_id != "rzp_test_your_key_id_here"
        && key_secret != "your_key_secret_here"
    {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap_or_default();

        let payload = serde_json::json!({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": format!("tip_{}", tip_id),
            "notes": {
                "story_id": story_id.to_string(),
                "story_title": &story_title,
                "author_id": author_id.to_string(),
                "tip_id": tip_id.to_string()
            }
        });

        let resp = client
            .post("https://api.razorpay.com/v1/orders")
            .basic_auth(&key_id, Some(&key_secret))
            .json(&payload)
            .send()
            .await;

        match resp {
            Ok(res) if res.status().is_success() => {
                let json: serde_json::Value = res.json().await.map_err(|e| {
                    AppError::internal_server_error(format!("Failed to parse Razorpay response: {}", e))
                })?;
                json.get("id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .ok_or_else(|| AppError::internal_server_error("Order ID missing from Razorpay response."))?
            }
            Ok(res) => {
                let err_text = res.text().await.unwrap_or_default();
                tracing::error!("Razorpay order creation returned error: {}", err_text);
                // Fallback to simulated test order if gateway test keys reject
                format!("order_sim_{}", &tip_id.to_string().replace("-", "")[..14])
            }
            Err(e) => {
                tracing::warn!("Razorpay connection failed ({}), using fallback simulation", e);
                format!("order_sim_{}", &tip_id.to_string().replace("-", "")[..14])
            }
        }
    } else {
        // Mock simulation mode when keys are not configured yet
        format!("order_sim_{}", &tip_id.to_string().replace("-", "")[..14])
    };

    let donor_name = body.donor_name.filter(|n| !n.trim().is_empty());
    let donor_message = body.donor_message.filter(|m| !m.trim().is_empty());

    // Record pending tip in DB
    sqlx::query(
        "INSERT INTO tips (
            id, story_id, user_id, author_id, amount, gross_amount,
            currency, order_id, status, donor_name, donor_message
         ) VALUES ($1, $2, $3, $4, $5, $6, 'INR', $7, 'pending', $8, $9)",
    )
    .bind(tip_id)
    .bind(story_id)
    .bind(auth.user_id)
    .bind(author_id)
    .bind(body.amount)
    .bind(body.amount as f64)
    .bind(&rzp_order_id)
    .bind(donor_name)
    .bind(donor_message)
    .execute(&pool)
    .await?;

    Ok(Json(CreateTipOrderResponse {
        order_id: rzp_order_id,
        amount: amount_paise,
        currency: "INR".to_string(),
        key_id,
        story_id,
        story_title,
        author_name: author_username.unwrap_or_else(|| "Author".to_string()),
    }))
}

/// POST /api/stories/:id/tip/verify
/// Verifies Razorpay HMAC signature, calculates platform fee, credits author wallet,
/// and adds audit ledger entry.
pub async fn verify_tip(
    State(pool): State<PgPool>,
    Path(story_id): Path<Uuid>,
    Json(body): Json<VerifyTipRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // 1. Fetch pending tip record
    let tip_row: Option<(Uuid, Uuid, Option<Uuid>, i32, String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT id, author_id, user_id, amount, status, donor_name, donor_message
         FROM tips
         WHERE order_id = $1 AND story_id = $2",
    )
    .bind(&body.order_id)
    .bind(story_id)
    .fetch_optional(&pool)
    .await?;

    let (tip_id, author_id, _donor_user_id, amount, status, existing_donor_name, existing_message) =
        tip_row.ok_or_else(|| AppError::not_found("Pending tip order not found."))?;

    if status == "completed" {
        return Ok(Json(serde_json::json!({
            "status": "success",
            "message": "Payment already confirmed and credited."
        })));
    }

    // 2. Cryptographic signature check & Simulation Guard
    let key_secret = std::env::var("RAZORPAY_KEY_SECRET").unwrap_or_default();
    let allow_simulation = std::env::var("ALLOW_PAYMENT_SIMULATION")
        .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
        .unwrap_or(false);

    let is_simulation = body.order_id.starts_with("order_sim_");

    if is_simulation {
        if !allow_simulation {
            return Err(AppError::bad_request(
                "Payment simulation is not allowed in production mode.",
            ));
        }
    } else {
        if key_secret.is_empty() || key_secret == "your_key_secret_here" {
            return Err(AppError::internal_server_error(
                "Razorpay payment gateway secret is not properly configured.",
            ));
        }

        let message = format!("{}|{}", body.order_id, body.payment_id);
        let mut mac = HmacSha256::new_from_slice(key_secret.as_bytes())
            .map_err(|e| AppError::internal_server_error(format!("HMAC initialization failed: {}", e)))?;
        mac.update(message.as_bytes());
        let expected_signature = hex::encode(mac.finalize().into_bytes());

        if !expected_signature.eq_ignore_ascii_case(&body.signature) {
            sqlx::query("UPDATE tips SET status = 'failed' WHERE id = $1")
                .bind(tip_id)
                .execute(&pool)
                .await?;
            return Err(AppError::bad_request("Payment signature verification failed."));
        }
    }

    // 3. Platform Fee Calculation (Default: 5%)
    let fee_percent: f64 = std::env::var("PLATFORM_FEE_PERCENT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5.0);
    let gross_amount = amount as f64;
    let platform_fee = (gross_amount * (fee_percent / 100.0) * 100.0).round() / 100.0;
    let net_amount = gross_amount - platform_fee;

    let donor_name = body.donor_name.or(existing_donor_name);
    let donor_message = body.donor_message.or(existing_message);

    // 4. Atomic database transaction
    let mut tx = pool.begin().await?;

    // 4a. Check for replay attack: ensure payment_id was not already completed
    if !is_simulation {
        let payment_already_used: Option<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM tips WHERE payment_id = $1 AND status = 'completed' AND id != $2 LIMIT 1",
        )
        .bind(&body.payment_id)
        .bind(tip_id)
        .fetch_optional(&mut *tx)
        .await?;

        if payment_already_used.is_some() {
            return Err(AppError::bad_request(
                "This Razorpay payment has already been credited to another transaction.",
            ));
        }
    }

    // 4b. Atomically update tip record from 'pending' to 'completed'
    // This prevents TOCTOU / concurrent replay attacks
    let rows_affected = sqlx::query(
        "UPDATE tips
         SET payment_id = $1, signature = $2, gross_amount = $3,
             platform_fee = $4, net_amount = $5, status = 'completed',
             donor_name = $6, donor_message = $7
         WHERE id = $8 AND status = 'pending'",
    )
    .bind(&body.payment_id)
    .bind(&body.signature)
    .bind(gross_amount)
    .bind(platform_fee)
    .bind(net_amount)
    .bind(&donor_name)
    .bind(&donor_message)
    .bind(tip_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();

    if rows_affected == 0 {
        return Err(AppError::bad_request(
            "This payment has already been processed or is being verified concurrently.",
        ));
    }

    // 4b. Increment story earnings
    sqlx::query("UPDATE stories SET earnings = earnings + $1 WHERE id = $2")
        .bind(amount)
        .bind(story_id)
        .execute(&mut *tx)
        .await?;

    // 4c. Ensure author wallet exists and credit balance
    sqlx::query(
        "INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(author_id)
    .execute(&mut *tx)
    .await?;

    let wallet_id: Uuid = sqlx::query_scalar(
        "UPDATE wallets
         SET balance = balance + $1,
             total_earned = total_earned + $1,
             updated_at = NOW()
         WHERE user_id = $2
         RETURNING id",
    )
    .bind(net_amount)
    .bind(author_id)
    .fetch_one(&mut *tx)
    .await?;

    // 4d. Ledger transaction entry
    let story_title: String = sqlx::query_scalar("SELECT title FROM stories WHERE id = $1")
        .bind(story_id)
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or_else(|| "your story".to_string());

    let donor_display = donor_name
        .clone()
        .unwrap_or_else(|| "A reader".to_string());

    let tx_desc = format!("Tip from {} on \"{}\"", donor_display, story_title);

    sqlx::query(
        "INSERT INTO wallet_transactions (
            wallet_id, user_id, type, gross_amount, platform_fee,
            net_amount, currency, status, reference_id, description
         ) VALUES ($1, $2, 'tip_received', $3, $4, $5, 'INR', 'completed', $6, $7)",
    )
    .bind(wallet_id)
    .bind(author_id)
    .bind(gross_amount)
    .bind(platform_fee)
    .bind(net_amount)
    .bind(tip_id.to_string())
    .bind(&tx_desc)
    .execute(&mut *tx)
    .await?;

    // 4e. In-app notification to author
    let notif_msg = format!(
        "🎉 {} supported \"{}\" with ₹{:.0} (₹{:.2} added to your wallet)!",
        donor_display, story_title, gross_amount, net_amount
    );
    sqlx::query(
        "INSERT INTO notifications (user_id, message, story_id) VALUES ($1, $2, $3)",
    )
    .bind(author_id)
    .bind(&notif_msg)
    .bind(story_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": format!("Thank you! ₹{:.0} donation received.", gross_amount),
        "gross_amount": gross_amount,
        "net_amount": net_amount,
        "platform_fee": platform_fee,
    })))
}

/// GET /api/stories/:id/tips
/// Returns public list of completed supporters and notes for a story.
pub async fn get_story_tips(
    State(pool): State<PgPool>,
    Path(story_id): Path<Uuid>,
) -> Result<Json<Vec<TipSupporterResponse>>, AppError> {
    let rows: Vec<TipSupporterResponse> = sqlx::query_as(
        "SELECT id, donor_name, donor_message, gross_amount::FLOAT8 as gross_amount, created_at
         FROM tips
         WHERE story_id = $1 AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT 20",
    )
    .bind(story_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

/// GET /api/author/tips
/// Returns authenticated author's tips across all their stories.
pub async fn get_author_tips(
    State(pool): State<PgPool>,
    AuthUser { user_id, .. }: AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let rows: Vec<(Uuid, String, Option<String>, Option<String>, f64, f64, Option<chrono::NaiveDateTime>)> = sqlx::query_as(
        "SELECT tips.id, stories.title, tips.donor_name, tips.donor_message,
                tips.gross_amount::FLOAT8, tips.net_amount::FLOAT8, tips.created_at
         FROM tips
         JOIN stories ON stories.id = tips.story_id
         WHERE tips.author_id = $1 AND tips.status = 'completed'
         ORDER BY tips.created_at DESC
         LIMIT 50",
    )
    .bind(user_id)
    .fetch_all(&pool)
    .await?;

    let items: Vec<serde_json::Value> = rows.into_iter().map(|(id, title, donor, msg, gross, net, date)| {
        serde_json::json!({
            "id": id,
            "story_title": title,
            "donor_name": donor.unwrap_or_else(|| "Anonymous".to_string()),
            "donor_message": msg,
            "gross_amount": gross,
            "net_amount": net,
            "created_at": date
        })
    }).collect();

    Ok(Json(serde_json::json!({ "items": items })))
}
