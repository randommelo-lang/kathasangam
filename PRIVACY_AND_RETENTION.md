# KathaSangam User Privacy and Data Retention Policy

**Document Status:** Effective  
**Last Updated:** October 2026  
**Applies to:** KathaSangam Web Platform (`kathasangam.co.in`, Render staging, and local environments)

---

## 1. Overview & Core Principles

KathaSangam is a digital publishing and reading platform for serialized web novels and chitrānk (visual stories). We respect user privacy, practice data minimization, and provide transparent self-service controls that match backend enforcement.

### Key Privacy Tenets
1. **Data Minimization:** We only collect and store data necessary for reading, authoring, and securing the platform.
2. **User Sovereignty:** Users have direct self-service tools to export their complete personal data and permanently delete their accounts.
3. **No Third-Party Ad Trackers:** KathaSangam does not embed commercial tracking scripts, pixel trackers, or data broker telemetry.
4. **Transparent Retention:** Ephemeral records (such as resolved moderation reports and audit logs) have defined retention windows.

---

## 2. User Data Categories

| Category | Data Elements | Storage Location | Retention Lifetime |
| :--- | :--- | :--- | :--- |
| **Account Identity** | User ID (`UUID`), Username, Email (via auth), Role (`reader`, `author`, `moderator`, `admin`), Avatar URL, Bio | PostgreSQL (`profiles`, `auth.users`) | Kept until user deletes account. |
| **User Preferences** | Reader theme (`light`/`dark`), reading mode (`scroll`/`pages`), font size, Date of Birth, NSFW preference (`blur`/`show`/`hide`), notification toggles | PostgreSQL (`profiles.preferences` JSONB) | Kept until user updates or deletes account. |
| **Reading History** | Story ID, Chapter ID, Page Index, Timestamp | PostgreSQL (`reading_progress`) | Kept until cleared by user or on account deletion. |
| **Library & Bookmarks** | Saved stories, bookmarked chapters, custom reading lists | PostgreSQL (`library`, `bookmarks`, `reading_lists`, `reading_list_items`) | Kept until removed by user or on account deletion. |
| **Authored Content (UGC)** | Stories, chapters, page images, license, cover art | PostgreSQL (`stories`, `chapters`, `chapter_content`, `chapter_pages`), Supabase Storage / local `uploads/` | Kept until deleted by author or on account deletion. |
| **Community Content (UGC)** | Comments, paragraph inline comments, tips | PostgreSQL (`comments`, `tips`) | Kept until removed by author or on account deletion. |
| **Legacy Direct Messages** | Sender ID, Receiver ID, content, timestamp | PostgreSQL (`direct_messages`) | Direct messaging is disabled in the app. Existing records are retained until an involved user deletes their account. |
| **Moderation & Safety** | Reports filed, report resolutions, audit actions taken | PostgreSQL (`reports`, `moderation_audit_logs`) | Active reports kept until resolved; resolved records pruned after 180 days. |

---

## 3. Account Deletion ("Right to be Forgotten")

### User-Facing Control
Under **Profile Settings → Danger Zone**, clicking **Delete Account** invokes an irreversible deletion confirmation modal.

### Backend Enforcement (`DELETE /api/profile`)
Account deletion executes an atomic database transaction (`pool.begin()`) that cascades through every database entity associated with the user:
1. **Comments:** Deletes all comments (`comments`) authored by the user.
2. **Library & Bookmarks:** Deletes all saved library records (`library`) and bookmarks (`bookmarks`).
3. **Reading Progress:** Deletes all tracked reading positions (`reading_progress`).
4. **Reading Lists:** Deletes user's reading lists and list items (`reading_lists`, `reading_list_items`).
5. **Legacy Direct Messages:** Deletes all historic records (`direct_messages`) where the user was sender or recipient.
6. **Social Graph:** Deletes all follower and followed relationships (`follows`).
7. **Collaborations:** Deletes collaboration invites and permissions (`story_collaborators`).
8. **Notifications & Tips:** Cleans up incoming and outgoing records (`notifications`, `tips`).
9. **Authored Stories & Chapters:** Cascades deletion across all stories, chapters, paragraphs, chapter pages, and comments on user's stories.
10. **Reports:** Cleans up or detaches user reports (`reports`).
11. **Profile Record:** Deletes the record from `public.profiles`.
12. **Auth Identity:** Initiates non-fatal deletion from `auth.users`.
13. **Storage Asset Cleanup:** Dispatches asynchronous tasks to delete avatar files and story cover images from the upload directory / storage bucket.

---

## 4. User Data Export ("Right to Data Portability")

### User-Facing Control
Under **Profile Settings → Privacy & Data Management**, clicking **Export My Data (JSON)** calls the export API and downloads a structured file named `kathasangam-user-data-<date>.json`.

### Backend Implementation (`GET /api/profile/export`)
The export endpoint authenticates the caller via JWT (`AuthUser`) and compiles an exhaustive JSON document containing:
* **Export Metadata:** `export_timestamp` (ISO 8601), `platform` identifier, `user_id`.
* **Profile:** Username, registered email, assigned role, avatar URL, bio.
* **Preferences:** Complete JSON preferences (reader theme, reading mode, font size, DOB, NSFW settings, notification toggles).
* **Reading Progress:** All tracked stories, chapters, page indices, and timestamps.
* **Library & Bookmarks:** All saved library entries and bookmarks.
* **Reading Lists:** Created playlists/reading lists and descriptions.
* **Authored Stories:** Titles, genres, languages, licenses, publication statuses, and creation timestamps.
* **Comments:** Full text and timestamps of comments left on chapters.
* **Legacy Direct Messages:** Historic messages sent and received with timestamps, if any remain.
* **Follow Statistics:** Follower and following counts.

---

## 5. Reading History & Content Preferences

### Reading History Management
* Reading positions are saved automatically during novel and comic reading via `POST /api/progress`.
* Users can view their reading progress across devices when authenticated.
* **Self-Service Wipe:** Users can click **Clear Reading History** under **Profile Settings → Privacy & Data Management** (invoking `DELETE /api/progress`). This immediately removes all reading position records for their account.

### Age-Related & Mature Content Controls
* **Date of Birth (DOB):** Users provide their DOB in profile preferences.
* **Minor Protection:** If the user is determined to be under 18 years old, 18+ / NSFW content is strictly disabled and locked to `Hidden (under 18)`.
* **Adult Preferences:** Users aged 18+ can toggle between:
  * `blur`: Show 18+ warning card with blurred media (default).
  * `show`: Display mature content without warning blur.
  * `hide`: Filter out all mature stories and chapters from Discover and search.

---

## 6. Legacy Direct-Message & Moderation Log Retention

### Legacy Direct Messages
* Direct messaging is no longer available through the application or API.
* Historic records, if present, remain covered by user export and account-deletion handling until removed with an involved account.

### Moderation & Audit Logs
* **Safety Requirement:** To prevent abuse, enforce community safety, and review staff actions, moderation records in `reports` and `moderation_audit_logs` are retained for **180 days** after resolution.
* **Pruning Routine (`POST /api/moderation/prune-retention`):** Authorized staff (admins/moderators) can trigger automated retention cleanup:
  ```json
  POST /api/moderation/prune-retention
  {
    "days_older_than": 180
  }
  ```
  This securely purges closed reports (`status IN ('resolved', 'dismissed')`) and audit log records older than the retention threshold.

---

## 7. Analytics & Telemetry

* **Operational Only:** KathaSangam records aggregate counters (`views`, `likes`, `reads`, `followers`) directly in the database to display story popularity.
* **Log Sanitization:** Server request logs record HTTP status, route path, request ID, and latency in milliseconds.
* **Strict Exclusions:** Authorization tokens, passwords, cookies, direct message contents, and query payloads are **never logged**.
