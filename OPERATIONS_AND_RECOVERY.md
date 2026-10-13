# KathaSangam Operational Recovery Procedures & Runbook

**Document Status:** Effective  
**Last Updated:** October 2026  
**Target Systems:** KathaSangam Rust API, PostgreSQL (Supabase / Render), Static Frontend, Upload Storage

---

## 1. Architecture & Operational Overview

KathaSangam is architected as:
* **API Backend:** Rust web service using Axum, SQLx, and Tokio async runtime, running on Render.
* **Database & Search:** PostgreSQL (with pg_trgm and full-text search indices); search runs entirely on PostgreSQL without requiring Meilisearch.
* **Storage:** Supabase Storage (S3-compatible) or local persisted `uploads/` directory for story covers, avatars, and comic chapter images.
* **Frontend:** Static publish bundle (`dist/public/`) served via Render CDN with Content-Security-Policy headers.

---

## 2. Database Migrations & Rollback Procedures

### Migration File Structure
Migrations are located in `backend/migrations/` and named sequentially:
```text
backend/migrations/
  0001_initial_schema.sql
  ...
  0018_story_collaborations.sql
  0019_robust_views_and_likes.sql
  0020_add_is_nsfw_to_stories.sql
  0021_add_parent_id_to_comments.sql
```

### Applying Migrations
1. **Via SQL Runner:**
   ```bash
   DATABASE_URL="postgres://..." cargo run --bin run_sql -- backend/migrations/0022_new_migration.sql
   ```
2. **Via psql:**
   ```bash
   psql "$DATABASE_URL" -f backend/migrations/0022_new_migration.sql
   ```

### Rollback Expectations & Expand/Contract Pattern
* **Rule 1: Backward Compatibility First:** Schema migrations must never immediately drop a column or rename a table in use by a live service. Use the **Expand/Contract** pattern:
  1. *Expand:* Add the new column/table as nullable or with a default. Deploy updated backend code.
  2. *Backfill:* Backfill historical data asynchronously.
  3. *Contract:* Remove the old column in a subsequent release after all traffic routes to the new schema.
* **Rule 2: Idempotent Execution:** Every migration should use `IF EXISTS`, `IF NOT EXISTS`, and transaction blocks (`BEGIN; ... COMMIT;`) so partially applied scripts do not corrupt schema state.
* **Rollback Execution:** When rolling back, apply the reverse DDL script directly via `psql "$DATABASE_URL" -f <down_script>.sql` and restart the backend service.

---

## 3. Database Backup & Disaster Restore Drills

### Automated Backup Strategy
* **Render / Supabase Managed Backups:** Daily snapshots with 7-day retention and Point-in-Time Recovery (PITR).
* **Manual / Offline Snapshot Command:**
  ```bash
  # Take compressed schema + data dump
  pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > "kathasangam_backup_$(date +%Y%m%d_%H%M%S).dump"
  ```

### Step-by-Step Restore Runbook
1. **Provision Target Database:** Never restore over a live database in a panic. Create a fresh temporary database or target staging:
   ```bash
   createdb -h localhost -U postgres kathasangam_restore_target
   ```
2. **Execute Restoration:**
   ```bash
   pg_restore --clean --if-exists --no-owner --no-privileges \
     -d "postgres://postgres:password@localhost:5432/kathasangam_restore_target" \
     "kathasangam_backup_20261003_120000.dump"
   ```
3. **Run Integrity Verification Queries:**
   ```sql
   -- Verify table record counts
   SELECT 'profiles' AS tbl, count(*) FROM profiles
   UNION ALL
   SELECT 'stories', count(*) FROM stories
   UNION ALL
   SELECT 'chapters', count(*) FROM chapters
   UNION ALL
   SELECT 'comments', count(*) FROM comments;

   -- Check database index health
   SELECT schemaname, relname, indexrelname FROM pg_stat_user_indexes WHERE idx_scan = 0;
   ```
4. **Drill Cadence:** Engineering executes a disaster restore drill once per quarter to a separate staging instance to ensure backup dumps are uncorrupted.

---

## 4. Upload Storage Backup & Cleanup

### Storage Organization
* **Avatars:** Uploaded to `/uploads/` or Supabase storage bucket `kathasangam/avatars/`.
* **Covers:** Uploaded to `/uploads/` or Supabase storage bucket `kathasangam/covers/`.
* **Chitrānk Pages:** Uploaded to `/uploads/` or Supabase storage bucket `kathasangam/pages/`.

### Storage Backup & Synchronization
When using local storage on Render Persistent Disks:
```bash
# Sync local uploads to offsite S3 / Supabase backup bucket
rclone sync /run/media/melo/Data/App/kathasangam/uploads/ s3:kathasangam-backup-bucket/uploads/
```

### Orphan File Cleanup Procedure
When stories, covers, or avatars are updated or deleted, the backend dispatches asynchronous deletion tasks via `delete_uploaded_file(url)`. If unlinked files remain after crashes:
1. Run orphan audit query:
   ```sql
   -- Find covers referenced by active stories
   SELECT cover FROM stories WHERE cover LIKE '/uploads/%'
   UNION
   SELECT avatar_url FROM profiles WHERE avatar_url LIKE '/uploads/%';
   ```
2. Compare directory file list with database result and delete files not referenced in any active record.

---

## 5. Health Checks & Latency Monitoring

### Actionable Health Endpoint (`GET /api/health`)
The health endpoint validates all critical dependencies and reports actionable metrics:
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2026-10-03T15:00:00Z",
  "database": {
    "status": "up",
    "latency_ms": 4,
    "pool": {
      "total_connections": 5,
      "idle_connections": 3
    }
  },
  "search": {
    "status": "up",
    "latency_ms": 4
  },
  "storage": {
    "status": "up",
    "mode": "supabase",
    "latency_ms": 12
  }
}
```
* **Status Codes:** Returns `200 OK` when healthy; returns `503 Service Unavailable` if the database, search, or storage is inaccessible.
* **Zero Credential Leakage:** No environment secrets, connection strings, or service keys appear in health payloads.

### Latency & Error Monitoring Middleware
Request logging in `backend/src/middleware.rs` provides structured observability:
* **Trace ID:** Every request receives an `x-request-id` HTTP header for cross-system correlation.
* **Server Errors (5xx):** Automatically logged at `ERROR` level with HTTP status, method, path, and request ID.
* **Slow Requests:** Any request exceeding **1,000 ms** latency is logged at `WARN` level with elapsed time.
* **Sanitized Logs:** Authorization headers, passwords, cookies, and message bodies are strictly excluded from logs.

---

## 6. Incident Investigation Runbooks

### Incident A: Database Connection Pool Exhaustion
* **Symptom:** Logs show `pool timed out while waiting for an open connection`.
* **Diagnosis:**
  1. Inspect `database.pool` stats from `GET /api/health` (`total_connections == max`).
  2. Query active PostgreSQL connections:
     ```sql
     SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state 
     FROM pg_stat_activity 
     WHERE state != 'idle' 
     ORDER BY duration DESC;
     ```
* **Resolution:**
  1. Terminate runaway long-running queries:
     ```sql
     SELECT pg_terminate_backend(<pid>);
     ```
  2. Increase pool size or acquire timeout in `backend/src/main.rs` (`acquire_timeout(Duration::from_secs(30))`).

### Incident B: Failed Notification Delivery
* **Diagnosis:**
  1. Check if recipient's profile is banned or deleted (`SELECT is_banned FROM profiles WHERE id = $1`).
  2. Inspect notification queue:
     ```sql
     SELECT id, user_id, message, created_at FROM notifications ORDER BY created_at DESC LIMIT 20;
     ```
* **Resolution:** If records exist in PostgreSQL but the frontend did not display them, check client WebSocket / Supabase session refresh state in browser console.

---

## 7. Incident Severity & Escalation Matrix

| Severity | Definition | Target Resolution | Triage Actions |
| :--- | :--- | :--- | :--- |
| **Sev-1 (Critical)** | Core site down; `/api/health` returns 503; reading and authoring blocked. | < 30 minutes | 1. Check database connectivity. 2. Restart Render API service. 3. Review Render deployment logs for panic/oom. |
| **Sev-2 (Major)** | Core reading works; image uploads or story searches failing. | < 2 hours | 1. Verify storage health check mode. 2. Verify PostgreSQL full-text indices. 3. Check disk space. |
| **Sev-3 (Minor)** | Isolated UI glitch, non-blocking notification delay. | < 24 hours | Log issue, recreate in staging with Playwright suite, apply patch. |
