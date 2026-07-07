use crate::models::*;
use crate::db::AuthUser;
use axum::{
    extract::{Path, State, Query},
    Json,
};
use sqlx::PgPool;
use uuid::Uuid;
use crate::errors::AppError;

async fn check_is_staff(pool: &PgPool, user_id: Uuid) -> Result<bool, AppError> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT role::text FROM profiles WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    if let Some((role,)) = row {
        Ok(role == "admin" || role == "moderator")
    } else {
        Ok(false)
    }
}

/// GET /api/reports
pub async fn list_reports(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Query(params): Query<ReportQuery>,
) -> Result<Json<PaginatedResponse<GroupedReportRow>>, AppError> {
    if !check_is_staff(&pool, auth.user_id).await? {
        return Err(AppError::forbidden("You do not have staff permissions to perform this action."));
    }

    let status_filter = match params.status.as_deref() {
        Some("all") | None => None,
        Some(s) => Some(s.to_lowercase()),
    };

    let target_type_filter = match params.target_type.as_deref() {
        Some("all") | None => None,
        Some(t) => Some(t.to_lowercase()),
    };

    let severity_filter = match params.severity.as_deref() {
        Some("all") | None => None,
        Some(s) => Some(s.to_lowercase()),
    };

    let search_filter = match params.search.as_deref() {
        Some(s) if !s.trim().is_empty() => Some(format!("%{}%", s.trim())),
        _ => None,
    };

    let sort = params.sort.as_deref().unwrap_or("newest");
    let limit = params.limit.unwrap_or(10);
    let offset = params.offset.unwrap_or(0);

    let count_sql = "SELECT COUNT(*) FROM ( \
          SELECT 1 FROM reports \
          LEFT JOIN stories s ON (reports.target_type = 'story' AND reports.target_id = s.id) \
          LEFT JOIN chapters ch ON (reports.target_type = 'chapter' AND reports.target_id = ch.id) \
          LEFT JOIN stories ch_s ON (ch.story_id = ch_s.id) \
          WHERE ($1::text IS NULL OR reports.status = $1) \
            AND ($2::text IS NULL OR reports.target_type = $2) \
            AND ($3::text IS NULL OR reports.severity = $3) \
            AND ($4::text IS NULL OR reports.reason ILIKE $4 OR s.title ILIKE $4 OR ch.title ILIKE $4 OR ch_s.title ILIKE $4) \
          GROUP BY reports.target_type, reports.target_id, reports.status \
        ) AS count_query";

    let total: i64 = sqlx::query_scalar(count_sql)
        .bind(&status_filter)
        .bind(&target_type_filter)
        .bind(&severity_filter)
        .bind(&search_filter)
        .fetch_one(&pool)
        .await?;

    let sort_dir = if sort == "oldest" { "ASC" } else { "DESC" };
    let sql = format!(
        "SELECT \
            min(reports.id::text)::uuid AS id, \
            min(reports.reporter_id::text)::uuid AS reporter_id, \
            reports.target_type, \
            reports.target_id, \
            string_agg(DISTINCT reports.reason, '; ') AS reason, \
            reports.status, \
            CASE \
                WHEN bool_or(reports.severity = 'high') THEN 'high' \
                WHEN bool_or(reports.severity = 'medium') THEN 'medium' \
                ELSE 'low' \
            END AS severity, \
            COUNT(*) AS report_count, \
            COALESCE(string_agg(DISTINCT COALESCE(p.username, 'Anonymous'), ', '), 'Anonymous') AS reporter_username \
          FROM reports \
          LEFT JOIN stories s ON (reports.target_type = 'story' AND reports.target_id = s.id) \
          LEFT JOIN chapters ch ON (reports.target_type = 'chapter' AND reports.target_id = ch.id) \
          LEFT JOIN stories ch_s ON (ch.story_id = ch_s.id) \
          LEFT JOIN profiles p ON (reports.reporter_id = p.id) \
          WHERE ($1::text IS NULL OR reports.status = $1) \
            AND ($2::text IS NULL OR reports.target_type = $2) \
            AND ($3::text IS NULL OR reports.severity = $3) \
            AND ($4::text IS NULL OR reports.reason ILIKE $4 OR s.title ILIKE $4 OR ch.title ILIKE $4 OR ch_s.title ILIKE $4) \
          GROUP BY reports.target_type, reports.target_id, reports.status \
          ORDER BY MAX(reports.created_at) {} LIMIT $5 OFFSET $6",
        sort_dir
    );

    let rows: Vec<GroupedReportRow> = sqlx::query_as(&sql)
        .bind(&status_filter)
        .bind(&target_type_filter)
        .bind(&severity_filter)
        .bind(&search_filter)
        .bind(limit)
        .bind(offset)
        .fetch_all(&pool)
        .await?;

    Ok(Json(PaginatedResponse {
        items: rows,
        total,
    }))
}

/// PATCH /api/reports/:id
pub async fn update_report(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateReportRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_is_staff(&pool, auth.user_id).await? {
        return Err(AppError::forbidden("You do not have staff permissions to perform this action."));
    }

    // Fetch the previous report status and targets for auditing
    let prev_report: Option<(String, String, Uuid)> = sqlx::query_as(
        "SELECT status, target_type, target_id FROM reports WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?;

    let (prev_status, target_type, target_id) = match prev_report {
        Some(r) => r,
        None => return Err(AppError::not_found("Report not found.")),
    };

    sqlx::query("UPDATE reports SET status = $1 WHERE target_type = $2 AND target_id = $3 AND status = $4")
        .bind(&body.status)
        .bind(&target_type)
        .bind(target_id)
        .bind(&prev_status)
        .execute(&pool)
        .await?;

    // Log the moderation action
    let mut details = serde_json::json!({
        "previous_status": prev_status,
        "new_status": body.status,
        "target_type": target_type,
        "target_id": target_id
    });
    if let Some(ref note) = body.note {
        let trimmed = note.trim();
        if !trimmed.is_empty() {
            details["note"] = serde_json::Value::String(trimmed.to_string());
        }
    }

    sqlx::query(
        "INSERT INTO moderation_audit_logs (moderator_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(auth.user_id)
    .bind(format!("status_update_{}", body.status))
    .bind("report")
    .bind(id)
    .bind(&details)
    .execute(&pool)
    .await?;

    Ok(Json(
        serde_json::json!({ "message": format!("Report {}.", body.status) }),
    ))
}

/// GET /api/reports/logs
pub async fn list_audit_logs(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Query(params): Query<AuditLogQuery>,
) -> Result<Json<PaginatedResponse<AuditLogRow>>, AppError> {
    if !check_is_staff(&pool, auth.user_id).await? {
        return Err(AppError::forbidden("You do not have staff permissions to perform this action."));
    }

    let limit = params.limit.unwrap_or(10);
    let offset = params.offset.unwrap_or(0);

    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM moderation_audit_logs")
        .fetch_one(&pool)
        .await?;

    let rows: Vec<AuditLogRow> = sqlx::query_as(
        "SELECT l.id, l.moderator_id, p.username AS moderator_name, l.action, l.target_type, l.target_id, l.details, l.created_at \
         FROM moderation_audit_logs l \
         LEFT JOIN profiles p ON l.moderator_id = p.id \
         ORDER BY l.created_at DESC LIMIT $1 OFFSET $2"
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await?;

    Ok(Json(PaginatedResponse {
        items: rows,
        total,
    }))
}

/// POST /api/reports
pub async fn create_report(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Json(body): Json<CreateReportRequest>,
) -> Result<Json<ReportRow>, AppError> {
    if body.reason.trim().is_empty() {
        return Err(AppError::bad_request("Report reason cannot be empty."));
    }

    let target_type = body.target_type.to_lowercase();
    if target_type != "story" && target_type != "chapter" && target_type != "comment" {
        return Err(AppError::bad_request("Invalid report target type. Must be story, chapter, or comment."));
    }

    let severity = body.severity.as_deref().unwrap_or("medium").to_lowercase();
    if severity != "low" && severity != "medium" && severity != "high" {
        return Err(AppError::bad_request("Invalid severity level. Must be low, medium, or high."));
    }

    let row = sqlx::query_as::<_, ReportRow>(
        "INSERT INTO reports (reporter_id, target_type, target_id, reason, status, severity) \
         VALUES ($1, $2, $3, $4, 'open', $5) \
         RETURNING id, reporter_id, target_type, target_id, reason, status, severity"
    )
    .bind(auth.user_id)
    .bind(&target_type)
    .bind(body.target_id)
    .bind(body.reason.trim())
    .bind(&severity)
    .fetch_one(&pool)
    .await?;

    Ok(Json(row))
}

/// PATCH /api/reports/:id/severity
pub async fn update_report_severity(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateReportSeverityRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_is_staff(&pool, auth.user_id).await? {
        return Err(AppError::forbidden("You do not have staff permissions to perform this action."));
    }

    let severity = body.severity.to_lowercase();
    if severity != "low" && severity != "medium" && severity != "high" {
        return Err(AppError::bad_request("Invalid severity level. Must be low, medium, or high."));
    }

    // Fetch targets for updating the entire group
    let prev_report: Option<(String, Uuid)> = sqlx::query_as(
        "SELECT target_type, target_id FROM reports WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?;

    let (target_type, target_id) = match prev_report {
        Some(r) => r,
        None => return Err(AppError::not_found("Report not found.")),
    };

    sqlx::query("UPDATE reports SET severity = $1 WHERE target_type = $2 AND target_id = $3")
        .bind(&severity)
        .bind(&target_type)
        .bind(target_id)
        .execute(&pool)
        .await?;

    // Log the moderation action
    sqlx::query(
        "INSERT INTO moderation_audit_logs (moderator_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(auth.user_id)
    .bind("severity_update")
    .bind("report")
    .bind(id)
    .bind(&serde_json::json!({ "new_severity": severity }))
    .execute(&pool)
    .await?;

    Ok(Json(serde_json::json!({ "message": "Report severity updated successfully." })))
}
/// POST /api/reports/bulk
pub async fn bulk_update_reports(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Json(body): Json<BulkUpdateReportsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_is_staff(&pool, auth.user_id).await? {
        return Err(AppError::forbidden("You do not have staff permissions to perform this action."));
    }

    let status = body.status.to_lowercase();
    if status != "resolved" && status != "escalated" {
        return Err(AppError::bad_request("Invalid status. Must be resolved or escalated."));
    }

    let mut transaction = pool.begin().await?;

    for id in &body.ids {
        // Fetch the previous report status and targets for auditing
        let prev_report: Option<(String, String, Uuid)> = sqlx::query_as(
            "SELECT status, target_type, target_id FROM reports WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(&mut *transaction)
        .await?;

        if let Some((prev_status, target_type, target_id)) = prev_report {
            // Update all reports targeting the same content with the same status
            sqlx::query("UPDATE reports SET status = $1 WHERE target_type = $2 AND target_id = $3 AND status = $4")
                .bind(&status)
                .bind(&target_type)
                .bind(target_id)
                .bind(&prev_status)
                .execute(&mut *transaction)
                .await?;

            // Log the moderation action
            let mut details = serde_json::json!({
                "previous_status": prev_status,
                "new_status": status,
                "target_type": target_type,
                "target_id": target_id,
                "is_bulk": true
            });
            if let Some(ref note) = body.note {
                let trimmed = note.trim();
                if !trimmed.is_empty() {
                    details["note"] = serde_json::Value::String(trimmed.to_string());
                }
            }

            sqlx::query(
                "INSERT INTO moderation_audit_logs (moderator_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)"
            )
            .bind(auth.user_id)
            .bind(format!("status_update_{}", status))
            .bind("report")
            .bind(id)
            .bind(&details)
            .execute(&mut *transaction)
            .await?;
        }
    }

    transaction.commit().await?;

    Ok(Json(serde_json::json!({ "message": format!("Successfully processed bulk update for {} reports.", body.ids.len()) })))
}

/// POST /api/moderation/ban
pub async fn ban_user(
    auth: AuthUser,
    State(pool): State<PgPool>,
    Json(body): Json<BanUserRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_is_staff(&pool, auth.user_id).await? {
        return Err(AppError::forbidden("You do not have staff permissions to perform this action."));
    }

    let result = sqlx::query("UPDATE profiles SET is_banned = true, ban_reason = $1 WHERE id = $2")
        .bind(body.reason.as_deref().unwrap_or("No reason specified"))
        .bind(body.user_id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found("User profile not found."));
    }

    // Log the moderation action
    sqlx::query(
        "INSERT INTO moderation_audit_logs (moderator_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(auth.user_id)
    .bind("ban_user")
    .bind("profile")
    .bind(body.user_id)
    .bind(&serde_json::json!({ "reason": body.reason }))
    .execute(&pool)
    .await?;

    Ok(Json(serde_json::json!({ "message": "User has been banned successfully." })))
}

/// POST /api/moderation/scan
pub async fn run_text_scan(
    auth: AuthUser,
    State(pool): State<PgPool>,
) -> Result<Json<TextScanResult>, AppError> {
    if !check_is_staff(&pool, auth.user_id).await? {
        return Err(AppError::forbidden("You do not have staff permissions to perform this action."));
    }

    let flagged_words = vec![
        "hate", "harass", "spam", "abuse", "offensive", "piracy", "plagiarism", "fuck", "shit", "bitch", "asshole"
    ];

    let reports: Vec<ReportRow> = sqlx::query_as("SELECT * FROM reports WHERE status = 'open'")
        .fetch_all(&pool)
        .await?;

    let reports_scanned = reports.len() as i64;
    let mut reports_escalated = 0;
    let mut details = Vec::new();

    for report in reports {
        let mut target_text = String::new();

        if report.target_type == "story" {
            let desc: Option<(Option<String>,)> = sqlx::query_as("SELECT description FROM stories WHERE id = $1")
                .bind(report.target_id)
                .fetch_optional(&pool)
                .await?;
            if let Some((Some(d),)) = desc {
                target_text = d;
            }
        } else if report.target_type == "chapter" {
            let paragraphs: Vec<(String,)> = sqlx::query_as("SELECT paragraph FROM chapter_content WHERE chapter_id = $1 ORDER BY sort_order")
                .bind(report.target_id)
                .fetch_all(&pool)
                .await?;
            target_text = paragraphs.into_iter().map(|(p,)| p).collect::<Vec<String>>().join(" ");
        } else if report.target_type == "comment" {
            let text: Option<(String,)> = sqlx::query_as("SELECT text FROM comments WHERE id = $1")
                .bind(report.target_id)
                .fetch_optional(&pool)
                .await?;
            if let Some((t,)) = text {
                target_text = t;
            }
        }

        let lower_text = target_text.to_lowercase();
        let mut matched_term = None;
        for word in &flagged_words {
            if lower_text.contains(word) {
                matched_term = Some(word.to_string());
                break;
            }
        }

        if let Some(term) = matched_term {
            if report.severity != "high" {
                sqlx::query("UPDATE reports SET severity = 'high' WHERE id = $1")
                    .bind(report.id)
                    .execute(&pool)
                    .await?;

                sqlx::query(
                    "INSERT INTO moderation_audit_logs (moderator_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)"
                )
                .bind(auth.user_id)
                .bind("auto_scan_escalation")
                .bind("report")
                .bind(report.id)
                .bind(&serde_json::json!({
                    "matched_keyword": term,
                    "previous_severity": report.severity,
                    "new_severity": "high"
                }))
                .execute(&pool)
                .await?;

                reports_escalated += 1;
            }

            details.push(TextScanReportDetail {
                report_id: report.id,
                target_type: report.target_type,
                target_id: report.target_id,
                matched_term: term,
            });
        }
    }

    Ok(Json(TextScanResult {
        reports_scanned,
        reports_escalated,
        details,
    }))
}
