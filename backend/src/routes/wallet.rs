use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::AuthUser;
use crate::errors::AppError;
use crate::models::*;

const DEFAULT_MIN_PAYOUT_AMOUNT: f64 = 100.0; // ₹100 minimum payout threshold

async fn is_admin(pool: &PgPool, user_id: Uuid) -> Result<bool, AppError> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT role::text FROM profiles WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(r,)| r == "admin").unwrap_or(false))
}

async fn can_moderate(pool: &PgPool, user_id: Uuid) -> Result<bool, AppError> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT role::text FROM profiles WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(r,)| r == "admin" || r == "moderator").unwrap_or(false))
}

/// GET /api/wallet
/// Returns current user's wallet overview.
pub async fn get_wallet(
    State(pool): State<PgPool>,
    AuthUser { user_id, .. }: AuthUser,
) -> Result<Json<WalletResponse>, AppError> {
    // Ensure wallet exists for user
    sqlx::query(
        "INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(user_id)
    .execute(&pool)
    .await?;

    let row: (f64, f64, f64, Option<String>) = sqlx::query_as(
        "SELECT balance::FLOAT8, total_earned::FLOAT8, total_withdrawn::FLOAT8, payout_upi_id
         FROM wallets
         WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_one(&pool)
    .await?;

    let fee_percent: f64 = std::env::var("PLATFORM_FEE_PERCENT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5.0);

    let min_payout: f64 = std::env::var("MIN_PAYOUT_AMOUNT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_MIN_PAYOUT_AMOUNT);

    Ok(Json(WalletResponse {
        balance: row.0,
        total_earned: row.1,
        total_withdrawn: row.2,
        payout_upi_id: row.3,
        min_withdrawal_amount: min_payout,
        platform_fee_percent: fee_percent,
    }))
}

/// GET /api/wallet/transactions
/// Returns current user's ledger of tip credits and payout debits.
pub async fn get_wallet_transactions(
    State(pool): State<PgPool>,
    AuthUser { user_id, .. }: AuthUser,
) -> Result<Json<Vec<WalletTransactionResponse>>, AppError> {
    let rows: Vec<WalletTransactionResponse> = sqlx::query_as(
        "SELECT id, type, gross_amount::FLOAT8 as gross_amount, platform_fee::FLOAT8 as platform_fee,
                net_amount::FLOAT8 as net_amount, currency, status, description, created_at
         FROM wallet_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 100",
    )
    .bind(user_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

/// PUT /api/wallet/payout-upi
/// Updates the user's registered UPI ID for withdrawals.
pub async fn update_payout_upi(
    State(pool): State<PgPool>,
    AuthUser { user_id, .. }: AuthUser,
    Json(body): Json<UpdatePayoutUpiRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let upi = body.payout_upi_id.trim();
    if !upi.contains('@') || upi.len() < 3 || upi.len() > 100 || upi.contains(' ') {
        return Err(AppError::bad_request("Please provide a valid UPI ID (e.g. username@okhdfcbank or 9876543210@paytm)."));
    }

    sqlx::query(
        "INSERT INTO wallets (user_id, payout_upi_id) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET payout_upi_id = $2, updated_at = NOW()",
    )
    .bind(user_id)
    .bind(upi)
    .execute(&pool)
    .await?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "Payout UPI ID updated successfully.",
        "payout_upi_id": upi
    })))
}

/// POST /api/wallet/payout-request
/// Requests a withdrawal of available balance to the creator's UPI ID.
pub async fn request_payout(
    State(pool): State<PgPool>,
    AuthUser { user_id, .. }: AuthUser,
    Json(body): Json<PayoutWithdrawalRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let min_payout: f64 = std::env::var("MIN_PAYOUT_AMOUNT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_MIN_PAYOUT_AMOUNT);

    if body.amount.is_nan() || body.amount.is_infinite() || body.amount < min_payout || body.amount > 500_000.0 {
        return Err(AppError::bad_request(format!(
            "Payout amount must be a valid number between ₹{:.2} and ₹500,000.00.",
            min_payout
        )));
    }

    let mut tx = pool.begin().await?;

    // Check wallet balance and payout UPI
    let wallet_row: Option<(Uuid, f64, Option<String>)> = sqlx::query_as(
        "SELECT id, balance::FLOAT8, payout_upi_id
         FROM wallets
         WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await?;

    let (wallet_id, current_balance, saved_upi) = wallet_row
        .ok_or_else(|| AppError::bad_request("Wallet not found."))?;

    if current_balance < body.amount {
        return Err(AppError::bad_request(format!(
            "Insufficient wallet balance. Available: ₹{:.2}, Requested: ₹{:.2}",
            current_balance, body.amount
        )));
    }

    let upi_id = body
        .payout_upi_id
        .as_deref()
        .map(str::trim)
        .filter(|u| !u.is_empty())
        .or(saved_upi.as_deref())
        .ok_or_else(|| AppError::bad_request("Please provide or save a Payout UPI ID before requesting withdrawal."))?;

    if !upi_id.contains('@') || upi_id.len() < 3 || upi_id.contains(' ') {
        return Err(AppError::bad_request("Invalid UPI ID format."));
    }

    let payout_id = Uuid::new_v4();

    // Deduct available balance
    let rows_affected = sqlx::query(
        "UPDATE wallets
         SET balance = balance - $1,
             payout_upi_id = COALESCE($2, payout_upi_id),
             updated_at = NOW()
         WHERE user_id = $3 AND balance >= $1",
    )
    .bind(body.amount)
    .bind(upi_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();

    if rows_affected == 0 {
        return Err(AppError::bad_request("Insufficient funds or concurrent withdrawal in progress."));
    }

    // Insert payout request
    sqlx::query(
        "INSERT INTO payout_requests (
            id, user_id, amount, payout_upi_id, status
         ) VALUES ($1, $2, $3, $4, 'pending')",
    )
    .bind(payout_id)
    .bind(user_id)
    .bind(body.amount)
    .bind(upi_id)
    .execute(&mut *tx)
    .await?;

    // Record pending debit in wallet transactions
    let desc = format!("Withdrawal request to {}", upi_id);
    sqlx::query(
        "INSERT INTO wallet_transactions (
            wallet_id, user_id, type, gross_amount, platform_fee,
            net_amount, currency, status, reference_id, description
         ) VALUES ($1, $2, 'payout_withdrawal', $3, 0.00, $3, 'INR', 'pending', $4, $5)",
    )
    .bind(wallet_id)
    .bind(user_id)
    .bind(body.amount)
    .bind(payout_id.to_string())
    .bind(&desc)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": format!("Payout of ₹{:.2} requested successfully to {}. Admin will disburse your payment shortly.", body.amount, upi_id),
        "payout_id": payout_id,
        "amount": body.amount,
        "payout_upi_id": upi_id
    })))
}

/// GET /api/admin/payouts
/// Lists all payout requests (Admin/Moderator only).
pub async fn list_admin_payouts(
    State(pool): State<PgPool>,
    AuthUser { user_id, .. }: AuthUser,
) -> Result<Json<Vec<PayoutRequestResponse>>, AppError> {
    if !can_moderate(&pool, user_id).await? {
        return Err(AppError::forbidden("Moderator or Admin privileges required."));
    }

    let rows: Vec<PayoutRequestResponse> = sqlx::query_as(
        "SELECT payout_requests.id, payout_requests.user_id, profiles.username,
                payout_requests.amount::FLOAT8 as amount, payout_requests.payout_upi_id,
                payout_requests.status, payout_requests.admin_notes, payout_requests.transaction_ref,
                payout_requests.requested_at, payout_requests.processed_at
         FROM payout_requests
         LEFT JOIN profiles ON profiles.id = payout_requests.user_id
         ORDER BY payout_requests.requested_at DESC
         LIMIT 100",
    )
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

/// POST /api/admin/payouts/:id/complete
/// Marks a payout request as completed and increments total_withdrawn (Admin only).
pub async fn complete_admin_payout(
    State(pool): State<PgPool>,
    AuthUser { user_id, .. }: AuthUser,
    Path(payout_id): Path<Uuid>,
    Json(body): Json<CompletePayoutRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !is_admin(&pool, user_id).await? {
        return Err(AppError::forbidden("Admin privileges required to disburse payouts."));
    }

    let utr = body.transaction_ref.trim();
    if utr.is_empty() {
        return Err(AppError::bad_request("Transaction reference / UTR number is required."));
    }

    let mut tx = pool.begin().await?;

    let payout_row: Option<(Uuid, f64, String, String)> = sqlx::query_as(
        "SELECT user_id, amount::FLOAT8, payout_upi_id, status
         FROM payout_requests
         WHERE id = $1",
    )
    .bind(payout_id)
    .fetch_optional(&mut *tx)
    .await?;

    let (creator_id, amount, upi_id, current_status) = payout_row
        .ok_or_else(|| AppError::not_found("Payout request not found."))?;

    if current_status != "pending" {
        return Err(AppError::bad_request(format!(
            "Cannot complete payout request with status '{}'.",
            current_status
        )));
    }

    // Update payout request
    sqlx::query(
        "UPDATE payout_requests
         SET status = 'completed',
             transaction_ref = $1,
             admin_notes = $2,
             processed_at = NOW()
         WHERE id = $3",
    )
    .bind(utr)
    .bind(&body.admin_notes)
    .bind(payout_id)
    .execute(&mut *tx)
    .await?;

    // Update creator wallet: total_withdrawn
    sqlx::query(
        "UPDATE wallets
         SET total_withdrawn = total_withdrawn + $1,
             updated_at = NOW()
         WHERE user_id = $2",
    )
    .bind(amount)
    .bind(creator_id)
    .execute(&mut *tx)
    .await?;

    // Update wallet transaction status
    sqlx::query(
        "UPDATE wallet_transactions
         SET status = 'completed'
         WHERE reference_id = $1 AND type = 'payout_withdrawal'",
    )
    .bind(payout_id.to_string())
    .execute(&mut *tx)
    .await?;

    // Send in-app notification to creator
    let notif_msg = format!(
        "✅ Your payout of ₹{:.2} was sent to {}! Reference (UTR): {}",
        amount, upi_id, utr
    );
    sqlx::query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
    )
    .bind(creator_id)
    .bind(&notif_msg)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": format!("Payout of ₹{:.2} marked as completed.", amount)
    })))
}

/// POST /api/admin/payouts/:id/reject
/// Rejects a payout request and refunds the money back to the creator's wallet balance (Admin only).
pub async fn reject_admin_payout(
    State(pool): State<PgPool>,
    AuthUser { user_id, .. }: AuthUser,
    Path(payout_id): Path<Uuid>,
    Json(body): Json<RejectPayoutRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !is_admin(&pool, user_id).await? {
        return Err(AppError::forbidden("Admin privileges required to reject payouts."));
    }

    let note = body.admin_notes.as_deref().unwrap_or("Withdrawal request rejected.");

    let mut tx = pool.begin().await?;

    let payout_row: Option<(Uuid, f64, String, String)> = sqlx::query_as(
        "SELECT user_id, amount::FLOAT8, payout_upi_id, status
         FROM payout_requests
         WHERE id = $1",
    )
    .bind(payout_id)
    .fetch_optional(&mut *tx)
    .await?;

    let (creator_id, amount, upi_id, current_status) = payout_row
        .ok_or_else(|| AppError::not_found("Payout request not found."))?;

    if current_status != "pending" {
        return Err(AppError::bad_request(format!(
            "Cannot reject payout request with status '{}'.",
            current_status
        )));
    }

    // Update payout request
    sqlx::query(
        "UPDATE payout_requests
         SET status = 'rejected',
             admin_notes = $1,
             processed_at = NOW()
         WHERE id = $2",
    )
    .bind(note)
    .bind(payout_id)
    .execute(&mut *tx)
    .await?;

    // Refund creator wallet balance
    sqlx::query(
        "UPDATE wallets
         SET balance = balance + $1,
             updated_at = NOW()
         WHERE user_id = $2",
    )
    .bind(amount)
    .bind(creator_id)
    .execute(&mut *tx)
    .await?;

    // Update wallet transaction status
    sqlx::query(
        "UPDATE wallet_transactions
         SET status = 'rejected',
             description = description || ' (Rejected: ' || $2 || ')'
         WHERE reference_id = $1 AND type = 'payout_withdrawal'",
    )
    .bind(payout_id.to_string())
    .bind(note)
    .execute(&mut *tx)
    .await?;

    // Send in-app notification to creator
    let notif_msg = format!(
        "⚠️ Your payout of ₹{:.2} to {} was returned to your wallet. Reason: {}",
        amount, upi_id, note
    );
    sqlx::query(
        "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
    )
    .bind(creator_id)
    .bind(&notif_msg)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": format!("Payout of ₹{:.2} was rejected and refunded to creator wallet.", amount)
    })))
}
