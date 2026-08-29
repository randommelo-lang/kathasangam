# KathaSangam Security Audit: Vulnerability Report

This document outlines key security vulnerabilities identified in the KathaSangam codebase (Rust Axum backend and HTML5/JS frontend).

---

## Executive Summary

The application has several critical security issues, primarily around **Broken Object Level Authorization (BOLA)**, **Information Disclosure (Data Leakage)**, **Lack of Authentication**, and **Improper JWT Validation**. Since the backend connects to Supabase via a superuser role bypassing Row Level Security (RLS), the backend must enforce all access controls. The current lack of authorization checks on multiple endpoints creates significant security risks.

---

## Detailed Vulnerability Analysis

### 1. [x] [CRITICAL] Unauthenticated Access to Administrative / Moderation Endpoints
* **Location**: [routes/reports.rs](file:///d:/App/kathasangam/backend/src/routes/reports.rs)
* **Status**: **Remediated**
* **Description**: 
  * The endpoints `GET /api/reports` (to list reports) and `PATCH /api/reports/:id` (to resolve or escalate reports) do not require `AuthUser` extraction.
  * Any unauthenticated user or client can fetch all abuse reports, exposing reporter IDs, target resource IDs, reasons, and severities.
  * Any client can send a `PATCH` request to change report statuses, bypassing the moderator/admin workflows entirely.
  * *Fix*: Added `AuthUser` extraction and verified role is `admin` or `moderator` using profiles lookup.

### 2. [x] [CRITICAL] Public Exposure of Private Notifications
* **Location**: [routes/notifications.rs](file:///d:/App/kathasangam/backend/src/routes/notifications.rs)
* **Status**: **Remediated**
* **Description**:
  * The endpoint `GET /api/notifications` is completely unauthenticated and does not extract `AuthUser` or filter notifications by `user_id`.
  * It executes a query `SELECT * FROM notifications ORDER BY created_at` and returns a flat list of notifications belonging to **all users** on the platform to any requester.
  * *Fix*: Required `AuthUser` and restricted fetching to only notifications belonging to the logged-in user (`WHERE user_id = $1`).

### 3. [x] [HIGH] Broken Object Level Authorization (BOLA) on Chapter Statuses
* **Location**: [routes/chapters.rs](file:///d:/App/kathasangam/backend/src/routes/chapters.rs)
* **Status**: **Remediated**
* **Description**:
  * The route `PATCH /api/chapters/:chapter_id/status` does not perform authentication.
  * Anyone can call this route and toggle the status (between `draft` and `published`) of any chapter across any story, regardless of whether they own the story or not.
  * *Fix*: Enforced ownership validation where only the story owner (author) or an admin can modify chapter statuses.

### 4. [x] [HIGH] Unauthenticated Access to Draft and Scheduled Chapters
* **Locations**: 
  * `list_chapters` in [routes/chapters.rs](file:///d:/App/kathasangam/backend/src/routes/chapters.rs)
  * `build_story_response` in [routes/stories.rs](file:///d:/App/kathasangam/backend/src/routes/stories.rs)
* **Status**: **Remediated**
* **Description**:
  * The query `SELECT * FROM chapters WHERE story_id = $1` is executed for public requests.
  * There is no logic separating or filtering out chapters with `status = 'draft'` or future `scheduled_at` timestamps for unauthenticated users. 
  * Regular readers can access all raw drafts and scheduled future chapters simply by querying the endpoints directly.
  * *Fix*: Filtered drafts and future scheduled chapters out of responses unless the requester is authenticated as the author, admin, or moderator.

### 5. [x] [MEDIUM] Weak JWT Claim Verification (Audience Bypass)
* **Location**: [db.rs](file:///d:/App/kathasangam/backend/src/db.rs)
* **Status**: **Remediated**
* **Description**:
  * During token validation, audience verification is explicitly disabled (`validation.validate_aud = false`).
  * If the JWT secret is reused elsewhere, or if there are multiple apps on the same Supabase project, tokens from other applications can be successfully authenticated by this backend.
  * *Fix*: Enabled audience validation (`validation.validate_aud = true`) and set the allowed audience to `authenticated`.

### 6. [x] [MEDIUM] User Display Name Spoofing in Comments
* **Location**: [routes/comments.rs](file:///d:/App/kathasangam/backend/src/routes/comments.rs)
* **Status**: **Remediated**
* **Description**:
  * The `create_comment` endpoint extracts the correct authenticated `user_id` from the JWT but trusts the client-provided `body.user` string for the return serialization payload.
  * An attacker could submit a comment and spoof the display name of any user or administrator in the response body.
  * *Fix*: Ignored client-supplied display names and queried the verified display name/username directly from the authenticated user's profile in the database.

### 7. [x] [LOW] Lack of Rate Limiting
* **Location**: [main.rs](file:///d:/App/kathasangam/backend/src/main.rs)
* **Status**: **Remediated**
* **Description**:
  * There is no middleware configured for rate limiting or request throttling.
  * Critical endpoints like `/api/upload/image` (which consumes cloud storage bandwidth and storage quotas) and `/api/stories` (which executes search/database requests) are susceptible to abuse, spam, and denial-of-service (DoS) attacks.
  * *Fix*: Integrated a rate limiting middleware (`RateLimiter` based on Governor) onto all `/api` routes.


---

## Recommended Remediation Plan

1. **Enforce Authentication & Role Verification**:
   * Add `auth: AuthUser` to the signatures of:
     * `list_notifications` (and filter query by `auth.user_id`).
     * `list_reports` and `update_report` (and verify the requesting user has the `moderator` or `admin` role in `profiles`).
     * `toggle_chapter_status` (and verify the user is the story author or an `admin`).
2. **Filter Draft and Scheduled Chapters**:
   * Modify chapter fetching queries to filter out `draft` or `scheduled` chapters unless the requesting user is authenticated as the author of the story or an admin.
3. **Verify Audience in JWT**:
   * Set `validation.validate_aud = true` and verify the audience claim matches your client ID configuration.
4. **Use Profile Data for Display Names**:
   * In comment creation, query the author's username from the `profiles` table using `auth.user_id` instead of echoing the client-supplied name.
5. **Implement Rate Limiting**:
   * Introduce a rate limiter middleware (e.g. `tower-governor` or Axum-based limiters) to protect resource-intensive endpoints.
