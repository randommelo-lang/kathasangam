# KathaSangam Implementation Plan

## Target Stack

| Component    | Service           |
| ------------ | ----------------- |
| Auth + DB    | Supabase Free     |
| Rust Backend | Railway           |
| Images       | Cloudflare R2     |
| Frontend     | Vercel Free       |
| CDN          | Cloudflare        |
| Search       | Local Meilisearch |

## Plan

### Backend Plan (Completed)

- [x] **Database & Auth Setup (Supabase)**:
  - [x] Create tables for users/profiles, stories, chapters, comments, reports, notifications, follows, and roles.
  - [x] Add role values for `reader`, `author`, `moderator`, and `admin`.
  - [x] Configure Supabase Auth for email/password authentication.
  - [x] Set up row-level security (RLS) policies and user triggers.
- [x] **Rust Axum Backend Connection**:
  - [x] Connect database using Connection Pool and environment variables.
  - [x] Implement API endpoints for stories, chapters, comments, library, reports, and notifications.
  - [x] Enforce authentication and role validation in backend handlers.
  - [x] Implement health check endpoints for deployment.
- [x] **Supabase Storage Integration**:
  - [x] Set up the `kathasangam` public bucket for story covers, comic pages, and avatars.
  - [x] Build backend raw binary file upload endpoints.
  - [x] Support filesystem storage fallback for local development.
- [x] **Search Indexing**:
  - [x] Integrate local Meilisearch indexing for stories (title, author, genre, tags, descriptions).
  - [x] Sync story updates and additions from backend database triggers/logic directly to Meilisearch index.
- [x] **Moderation System**:
  - [x] Implement backend moderation API to fetch, resolve, and escalate abuse reports.
  - [x] Set up backend audit logging for moderator and admin actions.

### Frontend Plan (Completed)

- [x] **Vercel Static Hosting**:
  - [x] Move API base URL configuration into environment variables.
  - [x] Configure frontend routing to call the Railway/production backend.
- [x] **Role-Based User Interface**:
  - [x] Implement role badges (Reader, Author, Moderator, Admin) and developer switchers.
  - [x] Restrict moderation panels and admin navigation to authorized users.
- [x] **Search and Discovery**:
  - [x] Connect local and production filters (genre, format type, keyword search).
- [x] **Release & Security Validation**:
  - [x] Audit frontend routing, image asset loaders, and Cloudflare CDN integration.

---

## Future Tasks (Completed)

### Backend Future Fixes

- [x] **Fix Comments Endpoints & Indexing**:
  - [x] Add `id` or `sort_order` to `ChapterResponse` serialization.
  - [x] Restructure `/api/chapters/:story_id/:index/comments` to locate the target chapter by its actual database `sort_order` or UUID, rather than the client-side array index (which changes when drafts are hidden).
- [x] **Enforce Draft Isolation**:
  - [x] Restrict `list_chapters` in [routes/chapters.rs](file:///d:/App/kathasangam/backend/src/routes/chapters.rs) to only expose drafts/scheduled chapters to the story's author (owner). Remove the override that lets moderators and admins view other users' private drafts.
  - [x] Restrict `build_story_response` in [routes/stories.rs](file:///d:/App/kathasangam/backend/src/routes/stories.rs) similarly, so that moderators and admins do not see unpublished draft chapters.

### Frontend Future Fixes

- [x] **Fix Comment Submission**:
  - [x] Modify `app.js` at the comment submission handler to pass `chapter.sort_order` or `chapter.id` to the API instead of `currentChapterIndex`.
  - [x] Handle backend 401 unauthenticated errors gracefully on comment submission, displaying a login prompt rather than failing silently.
- [x] **Enforce Studio Workspace Ownership Isolation**:
  - [x] Filter `state.stories` within `renderStudio()` in [app.js](file:///d:/App/kathasangam/app.js) to only display stories where `s.author_id === state.user.id`.
  - [x] Ensure that even if a user is a Moderator or Admin, they can only view and manage their own uploaded files/stories in the series workspace.

### Performance Optimizations (Completed)

- [x] **N+1 Query Resolution**: Replaced nested looping queries in backend story loading with batch fetch queries, speeding up response times from 1-2s to 50-100ms.
- [x] **Stats Collapsing**: Combined stat aggregation queries in the backend and cached stats client-side in `app.js` to prevent multiple requests.
- [x] **Optimistic UI**: Implemented instant UI updates for story, chapter, and comment deletions, syncing in the background with rollback support on failure.
- [x] **Token Memoization**: Implemented a TTL cache for token verification to avoid duplicate profile fetches.

### In-Built Chapter Editor & Document Extraction (Completed)

- [x] **Inline Text Editor**: Implemented a dark distraction-free editor in the web UI saving chapter titles and paragraph lists directly to PostgreSQL via a new `PUT` backend endpoint.
- [x] **Document Extraction**: Integrated browser-side `mammoth.js` (via CDN) to extract raw text from `.docx` files, along with native `.txt` text parsing.
- [x] **Smart Studio Routing**: Configured the big "Continue Writing" button to open the editor for the latest chapter (or auto-create one if empty), while keeping "New Chapter" on the timeline to create draft placeholders.
- [x] **Word Counter**: Built a real-time word counter that updates as the author writes and updates the backend chapter metrics.

### Image Compression (Completed)

- [x] **Bun.Image Optimization**: Integrated Bun's native image processing API to dynamically resize cover images to a maximum of 600px width and compress them into optimized WebP formats (80% quality) during uploads, with seamless fallback for uncompressed files if Bun is not available.

---

## Future Codebase Improvements (Completed)

### 1. Backend Performance: Caching JWT Decoding Key (Completed)
* **Problem**: The Elliptic Curve (EC) PEM public key (`SUPABASE_JWT_SECRET`) is parsed and parsed into a `jsonwebtoken::DecodingKey` on *every single authenticated request* inside the `AuthUser` extractor in `db.rs`. PEM parsing is cryptographically expensive and CPU-bound.
* **Solution**: Pre-parse the key once at application startup in `main.rs` and share it across endpoints using Axum State or a thread-safe static/lazy cell.
* **Status**: [x] Completed.


### 2. Backend Security: Protect Image Upload Route (Completed)
* **Problem**: The `/api/upload/image` route in `main.rs` does not require authentication, allowing any unauthenticated client to upload files to Supabase Storage or local disk space.
* **Solution**: Add `auth: AuthUser` as a parameter to the `upload_image` handler to restrict uploads to logged-in users.
* **Status**: [x] Completed.

### 3. Backend Memory: Rate Limiter Map Pruning (Completed)
* **Problem**: The in-memory rate limiter in `middleware.rs` retains keys in a `Mutex<HashMap<String, Vec<Instant>>>`. While expired timestamps are filtered, the IP keys themselves are never deleted, leading to a slow memory leak over time.
* **Solution**: Spin up a background thread to occasionally prune empty client IP entries or migrate to a sliding window crate like `governor`.
* **Status**: [x] Completed.

### 4. Frontend UX: Editor Auto-Save Draft (Completed)
* **Problem**: Accidentally navigating away, closing the browser, or losing internet connection in the chapter editor causes the writer to lose unsaved progress.
* **Solution**: Add an auto-save handler to local storage matching `editingChapterId` that loads drafts from cache on view initialize.
* **Status**: [x] Completed.


### 5. Frontend Architecture: Modularize `app.js` (Completed)
* **Problem**: `app.js` has grown into a single monolithic IIFE with over 1,700 lines of mixed rendering, routing, API calls, and events.
* **Solution**: Refactor frontend codebase into modern ES6 modules (e.g., `api.js`, `router.js`, `editor.js`, `components.js`).
* **Status**: [x] Completed.

---

## Next Improvements

### 1. Frontend Architecture: Extract Remaining Views (Medium)
* **Problem**: The app now uses ES modules, but `js/main.js` still owns several large render functions and event handlers.
* **Solution**: Move `renderDiscover`, `renderLibrary`, `renderReader`, `renderStudio`, and `renderModeration` into dedicated `js/views/*.js` modules, then split action handlers into feature-specific controller modules.
* **Status**: [x] Completed.

### 2. Frontend Reliability: Add Browser Smoke Tests (Medium)
* **Problem**: Current frontend validation relies on manual browser checks and `node --check`, which only catches syntax errors.
* **Solution**: Add Playwright smoke tests for discover, reader, studio, editor, login modal, protected route visibility, and comment submission states.
* **Status**: [x] Completed.

### 3. Backend API Quality: Typed Error Responses (Medium)
* **Problem**: Many backend handlers return only status codes, so the frontend cannot show specific failure messages.
* **Solution**: Standardize JSON error responses like `{ "error": "forbidden", "message": "..." }` across API routes.
* **Status**: [x] Completed.

### 4. Upload Security: File Validation and Size Limits (High)
* **Problem**: Uploads are authenticated, but the backend should still reject oversized files and invalid MIME/content types before storage.
* **Solution**: Enforce maximum file size, validate image MIME type and magic bytes, and return clear errors for unsupported formats.
* **Status**: [x] Completed.

### 5. Deployment Consistency: Align Meilisearch Environment Variables (Medium)
* **Problem**: Backend code expects `MEILISEARCH_URL` and `MEILISEARCH_KEY`, while deployment config uses `MEILI_URL` and `MEILI_MASTER_KEY`.
* **Solution**: Standardize one naming scheme in `search.rs`, `render.yaml`, and deployment documentation.
* **Status**: [x] Completed.

### 6. Frontend Security: Replace CDN UMD Scripts With Bundled Modules (Medium)
* **Problem**: Supabase and Mammoth are loaded from public CDN UMD bundles, which can trigger CSP warnings and makes dependency integrity harder to control.
* **Solution**: Introduce a lightweight build step or vendor pinned module builds with Subresource Integrity and a stricter Content Security Policy.
* **Status**: [x] Completed.

### 7. Product Feature: Reading Progress Persistence (Medium)
* **Problem**: Story progress exists in responses, but reader position and chapter progress are not robustly persisted per user.
* **Solution**: Add backend endpoints and frontend updates for per-user story/chapter progress, last-read chapter, and resume reading.
* **Status**: [x] Completed.

### 8. Product Feature: Report Creation From Reader UI (Medium)
* **Problem**: Moderation queue exists, but readers need a visible path to report stories, chapters, or comments.
* **Solution**: Add report buttons in reader/comment areas and a backend `POST /api/reports` handler for authenticated readers.
* **Status**: [x] Completed.

### 9. Author Experience: Story Metadata Editor (Medium)
* **Problem**: Authors can create stories and upload covers, but editing metadata is limited.
* **Solution**: Add a studio settings panel for title, genre, description, status, tags, language, license, and cover management.
* **Status**: [x] Completed.

### 10. Observability: Structured Logs and Health Diagnostics (Low)
* **Problem**: Backend logs are mostly plain `println!`/`eprintln!`, and health checks only return `OK`.
* **Solution**: Add structured tracing, request IDs, and health diagnostics for database/search/storage connectivity.
* **Status**: [x] Completed.

### 11. User Account UI: Profile Dropdown and Settings Page (High)
* **Problem**: Clicking the logged-in username currently does not open an account menu, and there is no dedicated profile/settings page for users.
* **Solution**: Add a user dropdown from the header avatar/name with links for Profile, Settings, Library, Studio, and Sign Out. Add a dedicated `#profile` or `#settings` view for account management.
* **Status**: [x] Completed.

### 12. User Profile Management: Avatar, Username, and Bio Editing (High)
* **Problem**: Users cannot edit their public profile details from the UI, including profile picture/avatar, display username, and bio.
* **Solution**: Add profile edit controls that let users upload/change avatar images, update username/display name, add a short bio, and preview their public reader/author profile.
* **Status**: [x] Completed.

### 13. Backend Profile API: Update Profile and Avatar Upload Support (High)
* **Problem**: The backend currently exposes profile fetch and role update, but not a full profile update workflow for user-facing settings.
* **Solution**: Add authenticated profile update endpoints for username, avatar URL, bio, and preferences. Reuse the protected image upload flow or add a dedicated avatar upload path.
* **Status**: [x] Completed.

### 14. User Preferences: Reader and Notification Settings (Medium)
* **Problem**: Reader preferences like theme, font size, reading mode, and notification choices are only local UI state or not configurable.
* **Solution**: Add settings for default reader theme, default text size, default reading mode, email/in-app notification preferences, and mature/sensitive content display preferences.
* **Status**: [x] Completed.

### 15. Product Feature: Community Features (DMs, Bookmarks, and Playlists) (Medium)
* **Problem**: Users want richer ways to interact with other readers and save stories they love.
* **Solution**: Implement community features such as user direct messaging (DMs), bookmarking stories, and creating custom reading lists.
* **Status**: [x] Completed.

### 16. Search & Analytics: Refined Search & Dashboard Metrics (Medium)
* **Problem**: Search is basic, and analytics dashboard lacks deep metrics.
* **Solution**: Refine search filtering options and improve the Author Studio analytics dashboards.
* **Status**: [x] Completed.

### 17. Product Feature: Word Extraction from PDF (Medium)
* **Problem**: Authors cannot import chapter content directly from PDF documents, requiring manual copy-pasting.
* **Solution**: Add dynamic PDF text/word extraction support in the chapter editor, similar to the existing Mammoth.js/TXT extraction.
* **Status**: [x] Completed.

### 18. Product Feature: Comic (Chitrānk) PDF Photo Extraction & Layout Editor (High)
* **Problem**: For chitrānk (comics/manga), authors need a way to upload/extract images from PDF files, arrange individual picture sequences with a drag-and-drop layout interface, and optimize uploaded comic images.
* **Solution**: Implement page/photo extraction from PDF files for comic chapters. Add a drag-and-drop interface allowing authors to drag and reorder the position of individual images. Compress extracted/added images using Bun image compression on upload.
* **Status**: [x] Completed.

### 19. Frontend UX: Story Details Page (Medium)
* **Problem**: Clicking a story redirects the user directly to the reader view of the first chapter instead of opening a story overview first.
* **Solution**: Add a dedicated Story Details view/page. When a user clicks a story, redirect them to this details page containing metadata, cover, description, and a list of chapters. Clicking a chapter from this list will then open the reader view.
* **Status**: [x] Completed.

### 20. Frontend UX: Custom Deletion Confirmation Modals (Low)
* **Problem**: Deletion actions (like deleting a story, chapter, or comment) currently use browser-native `confirm()` or `alert()` dialogs, which feel basic and disrupt the premium aesthetic.
* **Solution**: Replace native browser prompts with a custom, beautifully styled overlay confirmation modal component in the UI.
* **Status**: [x] Completed.

### 21. Frontend Reliability: Prevent Duplicate Polling Intervals (Medium)
* **Problem**: `startNotificationPolling()` creates a new `setInterval()` every time it is called and does not store or clear the interval handle. If bootstrap or future auth refresh flows call it more than once, duplicate polling loops can accumulate and keep issuing background API requests.
* **Solution**: Store the notification polling interval ID in shared UI state, guard against starting a second interval, and clear it on sign-out or app teardown.
* **Status**: [x] Completed.

### 22. Backend Memory Safety: Stream and Cap Upload Processing (High)
* **Problem**: The image upload handler reads the whole multipart field into memory with `field.bytes().await`, then clones the same buffer for Supabase upload. Large authenticated uploads can create avoidable memory pressure even with the current route body limit.
* **Solution**: Enforce a clear upload byte limit in the handler, reject oversized files before compression/storage, avoid unnecessary `data.clone()`, and consider streaming to temporary files for compression.
* **Status**: [x] Completed.

### 23. Frontend Security: Remove Data-Derived `innerHTML` in Analytics Tooltip (Medium)
* **Problem**: The studio chart tooltip builds HTML with string concatenation from `pt.label` in `views/studio.js`. Chapter/story labels are user-controlled data, so this creates an avoidable XSS risk if a malicious label reaches the chart.
* **Solution**: Build tooltip nodes with `textContent`/`el()` instead of `innerHTML`, and audit remaining `innerHTML` usage to keep it limited to static markup or DOM clearing.
* **Status**: [x] Completed.

### 24. Backend Security: Tighten CORS Policy (Medium)
* **Problem**: The backend uses `CorsLayer::permissive()`, which allows broad cross-origin API access. Auth still protects private routes, but permissive CORS increases the blast radius for browser-based abuse and weakens deployment hardening.
* **Solution**: Replace permissive CORS with an allowlist driven by environment variables for local development, Vercel preview domains, and production frontend origins.
* **Status**: [x] Completed.

### 25. Backend Security: Trust Proxy IP Headers Only From Known Proxies (Medium)
* **Problem**: Rate limiting and request logging trust `cf-connecting-ip` and `x-forwarded-for` headers directly. If the backend is reachable outside the intended proxy path, clients can spoof these headers and evade per-IP limits or poison logs.
* **Solution**: Only honor proxy IP headers when the remote address belongs to a configured trusted proxy range, otherwise use the socket address.
* **Status**: [x] Completed.

### 26. Profile Security: Validate Avatar URLs and Ownership (Medium)
* **Problem**: Profile updates accept arbitrary `avatar_url` strings. Users can point avatars at external tracking URLs or another user's uploaded asset, and old local/Supabase cleanup only works safely for known upload paths.
* **Solution**: Prefer uploaded avatar assets from the authenticated upload flow, validate URL scheme/host/path before saving, and only delete files owned by the current user.
* **Status**: [x] Completed.

### 27. Frontend Architecture: Normalize ES Module Cache Busting (Medium)
* **Problem**: Some frontend modules import shared singletons with `?v=...` while `api.js` imports `state.js` and `logger.js` without the query string. Browsers treat those as different module URLs, which can split state/logging singletons and cause confusing auth or UI behavior.
* **Solution**: Use one consistent import strategy for all local modules, preferably a build step or a single generated import map/cache version, instead of manually mixing query-string versions.
* **Status**: [x] Completed.

### 28. Test Portability: Move Required Test Helper Scripts Out of Ignored `scratch/` (Medium)
* **Problem**: Playwright global setup and teardown call `scratch/insert_test_user.py` and `scratch/cleanup_testplaywright.py`, but `/scratch/` is ignored. A fresh clone from GitHub may not include scripts required for the test suite.
* **Solution**: Move reusable test seed/cleanup scripts into a tracked folder such as `tests/helpers/` or `scripts/`, update Playwright config, and keep throwaway experiments in ignored `scratch/`.
* **Status**: [x] Completed.

---

## Open Code Quality Issues

### 21. Backend Cleanup: Remove Compile Warnings (Low)
* **Problem**: `cargo check` passes, but the backend still emits warnings for unused imports, unused assignments, unused structs, and unused helper functions.
* **Known Issues**:
  - Remove unused `StoryResponse` import from `routes/reading_lists.rs`.
  - Simplify `results` initialization in `routes/stories.rs`.
  - Remove or use `connect_db` in `db.rs`.
  - Remove or use `StoryModel`, `CommentRow`, `CreateCommentRequest.user`, and `get_stories`.
* **Solution**: Clean dead code and unused imports until `cargo check` is warning-free.
* **Status**: [x] Completed.

### 22. Frontend Cleanup: Continue Splitting Oversized Modules (Medium)
* **Problem**: The frontend is modular, but `js/main.js` is still large and owns too many responsibilities such as auth, profile/settings, notifications, routing glue, story modals, and reading progress helpers.
* **Solution**: Move auth/session logic into `auth.js`, notification UI into `notifications.js`, profile/settings view into `views/profile.js`, story modal/settings logic into a story controller, and reading progress helpers into `readingProgress.js`.
* **Status**: [x] Completed.

### 23. Editor Cleanup: Split Text Editor and Comic Editor Logic (Medium)
* **Problem**: `js/editor.js` contains both novel text editing and Chitrank/comic page editing, including extraction, drag-and-drop, autosave, and formatting controls.
* **Solution**: Split into `editor/textEditor.js`, `editor/comicEditor.js`, `editor/importers.js`, and `editor/autosave.js`.
* **Status**: [x] Completed.

### 24. Frontend UX Cleanup: Remove Remaining Native `alert()` Calls (Low)
* **Problem**: Some role-switching and community flows still use browser-native `alert()` for errors.
* **Solution**: Replace remaining `alert()` calls with the existing toast or custom modal system so all feedback matches the app UI.
* **Status**: [x] Completed.

### 25. Frontend Logging Hygiene: Gate Debug Logs (Low)
* **Problem**: Production frontend code still contains verbose auth/profile `console.log` statements, including partial token logging.
* **Solution**: Add a `DEBUG` flag or lightweight logger helper, remove token logging, and keep only actionable warnings/errors in production.
* **Status**: [x] Completed.

### 26. Repository Hygiene: Remove Generated Artifacts from Git (Medium)
* **Problem**: Generated/local files such as `playwright-report`, `test-results`, and scratch scripts are tracked in Git.
* **Solution**: Move reusable scripts into a documented `scripts/` folder if needed, remove generated reports/results from version control, and add `/playwright-report/`, `/test-results/`, and `/scratch/` to `.gitignore`.
* **Status**: [x] Completed.

### 27. Test Reliability: Reduce Fixed Sleeps and Live-State Coupling (Medium)
* **Problem**: Playwright tests use fixed waits and rely on a running backend at `localhost:3000`, which can make tests slow or flaky.
* **Solution**: Replace `waitForTimeout` with locator/network assertions, seed deterministic test data, and mock or isolate backend-dependent flows where appropriate.
* **Status**: [x] Completed.

### 28. Backend Robustness: Avoid `unwrap()`/`expect()` in Runtime Paths (Medium)
* **Problem**: Some backend code still uses `unwrap()`/`expect()` for environment variables, health response construction, test UUIDs, and old helper queries.
* **Solution**: Replace runtime `unwrap()`/`expect()` with typed startup validation or `AppError` responses, keeping unavoidable test-only unwraps clearly isolated.
* **Status**: [x] Completed.

### 29. Dependency Hygiene: Document Vendored Browser Libraries (Low)
* **Problem**: Large vendored browser scripts are committed under `js/vendor`, including PDF.js, Mammoth, and Supabase builds.
* **Solution**: Add version/source notes, update process, integrity checks, and a policy for when to vendor versus use package-managed dependencies.
* **Status**: [x] Completed.

### 30. Styling Maintainability: Split Large `styles.css` (Low)
* **Problem**: `styles.css` has grown very large and mixes global layout, auth, reader, studio, editor, profile, and community styling.
* **Solution**: Split styles into feature-oriented files or introduce a small build step that combines `css/base.css`, `css/layout.css`, `css/auth.css`, `css/reader.css`, `css/studio.css`, `css/editor.css`, and `css/community.css`.
* **Status**: [x] Completed.

---

## UI & UX

### 1. Typography & Font System Audit (High)
* **Problem**: The root configuration (`styles.css` line 22) enforces `font-family: 'Comic Sans MS', 'Comic Sans', cursive;` across the entire application interface. This overrides modern typography (like `Inter`) on buttons, dashboards, navigation headers, forms, and tables, reducing the platform's professional and premium aesthetic.
* **Solution**: Reconfigure `:root` to use `'Inter', sans-serif` as the base typeface for UI elements, reserving cursive or handwriting typefaces only for specific comic branding, tags, or badges.
* **Status**: [x] Completed.

### 2. Missing CSS Custom Properties Resolution (High)
* **Problem**: Variable classes such as `--text-muted`, `--text`, `--primary`, and `--surface-3` are frequently referenced in UI layout code (e.g., inside `studio.js`, `library.js`, `messages.js`, and settings panels) but are never defined in `styles.css` (or `base.css`). This triggers browser styling fallback and breaks theme consistency.
* **Solution**: Define the missing color and utility tokens within the `:root` section of `css/base.css` to align with the warm dark theme palette.
* **Status**: [x] Completed.

### 3. Responsive Messaging Layout on Mobile (High)
* **Problem**: The DM inbox layout (`messages.js`) uses a static two-column grid (`grid-template-columns: 320px 1fr`) that does not scale or collapse on screen sizes below 640px, completely breaking message reading and input functionality on mobile devices.
* **Solution**: Implement mobile-responsive styles for messages that hide the conversation list when a chat panel is active and include a "Back" button to return to the inbox view.
* **Status**: [x] Completed.

### 4. Custom Dialog & Accessibility (a11y) Compliance (High)
* **Problem**: Component factories (`components.js`) generate inaccessible interactive elements:
  * The custom modal dialog (`showConfirm()`) lacks key ARIA roles (`role="dialog"`, `aria-modal="true"`), focus-trapping behaviors, keyboard dismissal (Esc), and focus restoration.
  * Story card covers (`index.html`) lack descriptive accessible labels, making it hard for screen readers to navigate them.
  * Custom quick action tiles (`quickActionTile()`) are generic divs lacking keyboard focus (`tabindex="0"`) or keypress listeners.
* **Solution**: Enhance DOM helper factories in `components.js` to automatically set appropriate ARIA properties and implement full keyboard control over overlays and action grids.
* **Status**: [x] Completed.

### 5. Comic Page Fitting and Fluid Stage (High)
* **Problem**: In Comic reader mode, comic pages do not adjust smoothly to the viewport canvas. The absolute sizing constraints cause cropping, cutoffs, or excessive empty space depending on the device height and page aspect ratios.
* **Solution**: Transition the comic reader stage styling from absolute/fixed height limits to a fluid flexbox layout that lets pages dynamically occupy the maximum height and width available without distorting aspect ratios.
* **Status**: [x] Completed.

### 6. Interactive Element Focus & Hover States (Medium)
* **Problem**: Several buttons, tags, segment filters, and carousel navigation dots lack hover transitions or clear `:focus-visible` outlines, making keyboard and screen reader navigation feel disconnected.
* **Solution**: Add smooth transition hover states and distinct outline focus states to all custom interactive controls.
* **Status**: [x] Completed.

### 7. Modernize Editor Text Alignment APIs (Medium)
* **Problem**: The novel text editor in `editor.js` uses the deprecated `document.execCommand` for text alignment. This standard is not supported in modern browsers and leads to inconsistent alignment results.
* **Solution**: Replace `execCommand` formatting with native CSS alignment manipulation, applying target alignment classes directly to the editor nodes.
* **Status**: [x] Completed.

### 8. Skeleton Loading States and Empty Views (Medium)
* **Problem**: Large view updates (e.g., discover lists, library playlists, inbox conversations) display plain text loading strings ("Loading...") during data fetch cycles, which disrupts the premium user experience. Search screens also lack polished empty state panels.
* **Solution**: Replace raw loading messages with sleek SVG-based skeleton loading cards. Add descriptive empty state views with helpful calls-to-action (e.g., "Create a reading playlist").
* **Status**: [x] Completed.

### 9. Mobile Header and Search Ergonomics (High)
* **Problem**: The header combines primary navigation, search, genre filtering, auth controls, and notifications in one dense bar. On smaller screens this can feel cramped and makes search/filter actions harder to reach.
* **Solution**: Add a responsive mobile header pattern with a compact nav menu, collapsible search/filter panel, and stable tap targets for auth and notifications.
* **Status**: [x] Completed.

### 10. Reader Comfort Controls and Reading Position Feedback (High)
* **Problem**: The reader has theme, mode, text size, and progress, but controls are spread across toolbars and do not expose richer comfort settings such as line height, content width, font choice, or chapter jump feedback.
* **Solution**: Add a reader settings drawer for font family, line height, content width, theme, and page/scroll mode. Keep a sticky progress/chapter indicator that remains clear on desktop and mobile.
* **Status**: [x] Completed.

### 11. Profile Settings: Replace Avatar URL Input With Upload Flow (High)
* **Problem**: The settings page asks users to paste an avatar URL, which feels technical and does not match normal profile-editing expectations.
* **Solution**: Add an avatar upload control with preview, remove/change actions, validation feedback, and fallback initials. Reuse the authenticated upload endpoint and save the resulting URL to the profile.
* **Status**: [x] Completed.

### 12. Messages UX: Unread Counts and Sending States (Medium)
* **Problem**: Direct messages poll for updates, but the UI does not clearly show unread counts, delivery/sending states, or failures inline in the conversation.
* **Solution**: Add unread badges in the conversation list, optimistic outgoing bubbles with pending/error states, retry controls, and clearer empty/error states for failed message loads.
* **Status**: [x] Completed.

### 13. Studio Analytics Tooltip and Chart Accessibility (Medium)
* **Problem**: Studio chart points only reveal values on mouse hover, which excludes keyboard and touch users and makes analytics harder to inspect on mobile.
* **Solution**: Make chart points keyboard-focusable, show the same tooltip on focus/tap, add accessible labels, and provide a compact data table summary below the chart.
* **Status**: [x] Completed.

### 14. Form-Level Validation and Save Feedback Consistency (Medium)
* **Problem**: Profile, story settings, editor, and community forms use mixed feedback patterns. Some errors appear as toasts, others as inline hints, and successful saves can be easy to miss.
* **Solution**: Standardize inline validation messages, disabled/loading button states, success confirmations, and retry guidance across account settings, story creation, chapter editing, playlists, and messages.
* **Status**: [x] Completed.

### 15. Empty State Calls to Action for First-Time Users (Low)
* **Problem**: Some empty screens explain that there is no content, but do not always offer the next best action for new readers/authors.
* **Solution**: Add context-specific calls to action for empty library tabs, message inbox, studio dashboard, reading lists, comments, and public profiles.
* **Status**: [x] Completed.

### Home Page/ Discovery

* **Problems**:
  1. **Progress Text & Card Tag Overlap**: The "X% read" progress indicators inside story cards overlap with the genre tags immediately below them.
  2. **Cluttered Card Metadata**: The metadata block (e.g. `Adventure, psychological Horror / melo / 0 reads`) is cramped, wraps awkwardly, and uses generic slash separators.
  3. **Low-Relevance Personal Stats Row**: The Discover/Home view includes a prominent `Published / Total reads / Followers / Open reports` stats row for all logged-in users. For simple readers, this displays all zeros, wasting valuable vertical real estate.
  4. **Unbalanced Grid Layout on Desktop**: When the query yields few results, cards align far-left, leaving vast blank space on the right of widescreen monitors.
  5. **Carousel Visual Refinements**: The featured carousel height and typography contrast need minor aesthetic enhancements to feel premium.

* **Proposed Improvements**:
  - [x] **Fix Card Progress Overlaps**: Adjust padding, margin, or layout flow within `story-card` so that progress bars and percent read labels have distinct spacing and never overlap with tags or buttons.
  - [x] **Clean Up Story Card Info & Badges**: Format the card metadata cleanly (e.g., using subtle dot separators, separating author and views, and formatting the title nicely).
  - [x] **Role-Conditional Stats Row**:
    - Only show the personal/moderator stats row to users with roles `author`, `moderator`, or `admin`, or when they have actual metrics (e.g., published stories > 0).
    - Completely hide the row for standard readers or when logged out.
  - [x] **Symmetric Desktop Grid Layout**: Center the story card grid and ensure the column layout adjusts smoothly using auto-fit and centered max-width.
  - [x] **Upgrade Carousel Banner Aesthetics**: Add soft text shadows to overlay typography, increase spacing/contrast, and ensure smooth diagonal-gradient slide transitions.

* **Status**: [x] Completed.

### Library

* **Problems**:
  1. **Bookmarks Empty State Squeeze**: The "Your bookmarks shelf is empty" placeholder card is inside the `.story-grid` container. This constrains it to a single-column layout grid cell on the left side, leaving most of the main content column empty and unbalanced.
  2. **Blank Sidebar Panels**: The `Notifications` and `Progress` sections in the right sidebar render completely empty boxes when there are no active items. This looks broken and incomplete.
  3. **Sidebar Progress Items**: The `Progress` section loops through bookmarks and renders progress bars, but has no fallback message if bookmarks are empty, resulting in a blank header card.

* **Proposed Improvements**:
  - [x] **Fix Bookmarks Empty State Spacing**: Spacing of the bookmarks empty state should span the entire width of the page container. Apply `grid-column: 1 / -1;` to `.empty-state` or temporarily strip the `.story-grid` class from the wrapper when bookmarks are empty.
  - [x] **Notifications Panel Fallback**: Add a clean, centered inline text label (e.g. `No new notifications`) inside the `Notifications` sidebar card when the notifications list is empty.
  - [x] **Progress Panel Fallback**: Filter progress items to show active reads. If no books are in progress or bookmarks are empty, display a clean fallback placeholder (e.g., `No reading progress tracked yet`).
  - [x] **Responsive Aside Layout**: Ensure the two-column sidebar layout responsive margins align correctly on medium screens (tablets) so sidebar widgets wrap below the main tab panel instead of causing layout overflow.

* **Status**: [x] Completed.

### Reader

* **Problems**:
  1. **Crowded and Wrapping Toolbar**: The top toolbar mixes navigation (`Prev`/`Next`), reader modes, fullscreen, theme, and report buttons in a single flex-wrap container. This gets cluttered and wraps awkwardly on smaller viewports.
  2. **Unpolished Metadata Styling**: The author, chapter name, and price metadata are rendered with raw slashes ` / ` and plain text styles, reducing the premium feel.
  3. **Stark Orange Divider**: A bright, solid orange border separates the toolbar from the content, which can feel harsh and disrupt reader immersion.
  4. **Redundant "Open" Button in Chapters Panel**: The bottom chapters list panel renders a large, full-width `Open` button for every chapter card, creating unnecessary visual noise.
  5. **Cluttered Empty Comments State**: The comments sidebar panel shows a "Write a Comment" CTA button when the panel is empty, but the comment textarea is already always visible right below it, creating redundant actions.
  6. **Lack of Theme Cohesion in Comments & Chapters**: While the reading area adapts to light/dark/sepia themes, the bottom layout panels (Chapters list and Comments sidebar) remain dark and do not adapt cohesively.

* **Proposed Improvements**:
  - [x] **Redesign top Reader Toolbar**: Split the toolbar into a more elegant, structured layout. Place a clean "Back to Story Details" link/breadcrumb on the left, clear dot-separated metadata in the center, and group control action buttons (Theme, Settings, Fullscreen, and Report) on the right.
  - [x] **Modern Icon-Based UI**: Use clean icon buttons or refined modern pills for the settings drawer toggles, theme switcher, and fullscreen controls.
  - [x] **Improve Chapters List Panel**: Format the index list to look like a premium table of contents. Make the entire chapter item row clickable (with smooth hover background transitions) and highlight the currently active chapter with a warm accent border/badge.
  - [x] **Cohesive Full-Frame Themeing**: Update CSS rules so that theme selection (light/dark/sepia) cascades to the entire reader frame, including the bottom chapters and comments panels, sidebars, textareas, and buttons.
  - [x] **Enhance Comments Feed UX**: Add clean user avatars/initials for comments. Remove the redundant "Write a Comment" CTA from the empty state card and display an inline author badge (e.g. `Author`) in the warm primary color next to comments left by the story's creator.
  - [x] **Follow-up Toolbar Cleanup & Bottom Nav**: Simplified the toolbar button row to only contain Settings. Moved "Prev" and "Next" buttons below the content, and put "Fullscreen" and "Report" actions inside the Settings drawer.

* **Status**: [x] Completed.

### Author Studio

* **Problems**:
  1. **Redundant Chapter Reads Table**: The Analytics Overview contains a text-based table below the chart showing reads/words per chapter. This repeats information already visible via interactive chart point tooltips and timeline summaries, adding unnecessary vertical height to the sidebar.


* **Proposed Improvements**:
  - [x] **Remove Redundant Chapter Table**: Completely remove the chapter data table (`dataTable`) below the line chart in the right column, leaving the workspace cleaner, less redundant, and more compact.

* **Status**: [x] Completed.

### Moderation Queue

* **Problems**:
  1. **Anonymous / Blank Target Context**: The queue items display a blank title because the reported item target (`r.target` UUID) is not resolved to a human-readable name, nor is there a link to review the reported story, chapter, or comment.
  2. **Active Action Buttons on Non-Open Items**: Report cards showing already resolved or escalated statuses still display active `Resolve` and `Escalate` buttons instead of hiding them or displaying them in disabled/greyed-out states.
  3. **Lack of Status Filtering**: All reports (open, resolved, escalated) are mixed together in a single list, making it difficult to focus on pending cases.
  4. **Plain Metadata Representation**: Severity (low, medium, high) and status (open, resolved, escalated) are rendered in a single concatenated string, which lacks visual structure and makes quick scanning difficult.
  5. **Missing Audit Logs Panel**: Although the backend records and exposes moderator actions via `/api/reports/logs`, the frontend has no panel or tab to view these audit logs.

* **Proposed Improvements**:
  - [x] **Resolve Target Context & Links**: Modify queue items to show the reported target type (e.g., `Story`, `Chapter`, `Comment`) with a descriptive link allowing moderators to jump directly to the target content.
  - [x] **Refine Button States**: Fix the disabled button styling in `css/base.css` or hide the action buttons altogether for report items that are not in the "open" state.
  - [x] **Implement Queue Filters**: Add tab filters at the top of the queue (e.g., `All`, `Open`, `Escalated`, `Resolved`) to let moderators toggle lists.
  - [x] **Add Color-Coded Badges**: Replace the text-meta string with distinct badges (e.g., red for high severity, orange for escalated, green for resolved) to improve scanning.
  - [x] **Build Audit Log Panel**: Add a toggle or separate tab to view the moderator action history logs fetched from `/api/reports/logs`.

* **Status**: [x] Completed.

### Story Details Page

* **Problems**:
  1. **Unstyled Layout & Mashed Text**: Multiple text elements and badges are mashed together because their classes (like `story-details-badge-row`, `story-details-stats`, `chapter-item-info`, and `chapter-item-title`) have no definitions in any of the CSS files:
     - Genre/Type badges show as a single mashed string: `Adventurepsychological HorrorWeb Novel`.
     - Stats numbers and labels run together: `0 reads0 followers1 chapters`.
     - Table of Contents chapter headers touch: `PrologueCh. 1 · Free`.
  2. **Author Display Formatting**: The author credit displays as `By` directly touching the author name link without standard whitespace spacing or font weight hierarchy.
  3. **Repetitive Table of Contents Action Buttons**: Each chapter card features a large full-width "Read" button, which looks repetitive, bulky, and clutters the visual layout.
  4. **Basic Progress & Sidebar Panels**: The `Your Progress` and `About the Author` sidebar panels use simple, unstyled layout segments that do not fit the premium dark-warm design theme.

* **Proposed Improvements**:
  - [x] **Define Missing CSS Rules**: Add styling classes to the CSS stylesheets to properly layout, format, and add gap spacing to all story page elements:
    - Apply flex display with `gap: 8px;` or margins to badges (`story-details-badge-row`) and story stats (`story-details-stats`).
    - Use flexbox alignment in the chapters list items (`details-chapter-item`) so that chapter titles (`Prologue`) and subtitle info (`Ch. 1 · Free`) are stacked vertically with clean letter spacing and a modern, high-contrast layout.
  - [x] **Redesign Table of Contents List**: Clean up the chapter row list to look like an index table. Make the entire chapter item row clickable (with hover highlights) and replace the bulky buttons with a small, clean read arrow/icon.
  - [x] **Refine Action Buttons & Card Shadows**: Apply premium padding, warm gradients, and subtle glow effects to the `Bookmark`, `Add to Playlist`, and `Resume Reading` buttons.
  - [x] **Aesthetic Sidebar Upgrade**:
    - For `Your Progress`: Style progress bars with rounded corners, high contrast numbers, and warm gradients.
    - For `About the Author`: Build a premium author summary card with a circular initial avatar, clean alignment, and subtle accent text.

* **Status**: [x] Completed.

### User Profile & Settings

* **Problems**:
  1. **Basic and Flat Metrics Panel Layout**: The metrics cards (`Stories` and `Total Reads`) display centered text and numbers in a simple grey block. This layout is flat and doesn't carry the premium aesthetic seen elsewhere (like icons or interactive hover behaviors).
  2. **Coarse Profile Header Card Details**: The main header card lacks structure. Details such as email and role are rendered in simple stacked text elements, and the role badge styling (`ADMIN` or role indicators) has basic flat colors that could look much sleeker.
  3. **Simplistic Tabs Bordering**: The `Profile` and `Settings` tab navigation buttons use a basic border-bottom highlight, which lacks smooth transitions or micro-animations.

* **Proposed Improvements**:
  - [x] **Redesign Metrics Panel Grid**: Style the metrics blocks as high-contrast cards with subtle warm borders, adding relevant SVG icons (e.g. book icons for stories, eye icons for reads) and smooth hover translation effects.
  - [x] **Polished Header Card & Badges**: Add a dark-warm gradient glassmorphic background to the header card. Make the role indicators look like premium capsules/badges with custom glows based on the role (e.g., gold glow for admin, orange for moderator, green for author).
  - [x] **Tab Hover & Active Transitions**: Implement smooth transition effects (opacity/underline sliding) on tab switcher clicks.
  - [x] **Add User Story Count Badge**: Display a small total stories pill/badge inline near the "Your Stories" header on the profile tab.

* **Status**: [x] Completed.
## Moderation System — Future Improvement Plan

### How Moderation Currently Works
The moderation system is a **manual review queue**:
1. **User Reporting Flow**: A logged-in reader sees a **⚠️ Report** button in the Reader settings drawer (for stories/chapters) and a **Report** text button on each comment. Submitting a report POSTs to `/api/reports` creating a report row with `status = 'open'` and `severity = 'medium'`.
2. **Staff Review Flow**: Users with `moderator` or `admin` roles see a **Moderation** link in the nav bar. The Moderation page has two tabs: **Review Queue** and **Audit Logs**. Staff can click **Resolve** or **Escalate** which PATCHes the report status and logs the action to `moderation_audit_logs`.
3. **Database Tables**:
   - `reports`: Stores user reports (`reporter_id`, `target_type`, `target_id`, `reason`, `status`, `severity`).
   - `moderation_audit_logs`: Logs staff actions (`moderator_id`, `action`, `target_type`, `target_id`, `details` JSONB).

### Proposed Moderation Improvements

#### 🔴 Critical — Missing Core Functionality
- **Content removal actions from moderation view (P0)**: Currently, moderators can only change a report's status (resolve/escalate). They cannot delete or hide the actual reported content directly. We need to add "Remove Content" action buttons, support staff deletion endpoints for chapters/comments, and fix API role checks so moderators (not just admins) can delete stories.
- **Content preview in report cards (P0)**: Add inline expandable previews so moderators can view the reported content (story synopsis, chapter text excerpt, or comment text) directly in the queue without navigating away.
- **User ban/suspend system (P1)**: Add `is_banned` and `ban_reason` fields to the profiles table, support a staff endpoint to ban users, check ban status on login/requests, and add a "Ban User" action button to report cards.
- **Severity selection & editing (P1)**: Allow reporters to select severity (low/medium/high) during submission, and let moderators adjust it via a dropdown on the card.

#### 🟡 Important — UX & Workflow Improvements
- **Remove or implement stub features (P2)**: Either remove the non-functional "Run text scan" and "Export queue" sidebar buttons, or implement them (e.g. download CSV export, run basic keyword profanity matching).
- **Pagination (P2)**: Support page limits and offsets on the backend, and pagination controls on the frontend for both reports and audit logs.
- **Moderator notes on actions (P2)**: Ask for an optional reason/note when resolving or escalating, storing it in the audit log details JSONB to show in the history table.
- **Protect stats endpoint (P2)**: Restrict the public `GET /api/stats` endpoint so `open_reports` counts are only exposed to authenticated staff.
- **Search, sort, and advanced filters (P3)**: Add text search (by reason/title), sorting toggles (newest/oldest), and filters for target type and severity.
- **Improve audit logs UI (P3)**: Redesign the basic logs table into a card list matching the queue style, with action-type color coding.

#### 🟢 Nice to Have — Polish & Advanced Features
- **Smoke tests for moderation (P4)**: Add automated Playwright integration tests checking page access, tab switches, resolve/escalate actions, and audit log rendering.
- **New report notifications (P4)**: Add a badge counter showing open report counts on the Moderation nav link, updated via real-time WebSocket or polling.
- **Show reporter info (P4)**: Show the username of the reporter on each card.
- **Bulk actions (P5)**: Allow multi-selecting reports to batch resolve or escalate.
- **Duplicate report grouping (P5)**: Group multiple reports targeting the same content to display them as a single card with a report count.

| Priority | Item | Effort |
|----------|------|--------|
| 🔴 P0 | Content removal actions | Medium |
| 🔴 P0 | Content preview | Medium |
| 🔴 P1 | User ban/suspend system | Large |
| 🔴 P1 | Severity selection & editing | Small |
| 🟡 P2 | Remove or implement stub features | Small |
| 🟡 P2 | Pagination | Medium |
| 🟡 P2 | Moderator notes on actions | Small |
| 🟡 P2 | Protect stats endpoint | Small |
| 🟡 P3 | Search, sort, and advanced filters | Medium |
| 🟡 P3 | Improve audit logs UI | Medium |
| 🟢 P4 | Smoke tests | Medium |
| 🟢 P4 | New report notifications | Small |
| 🟢 P4 | Show reporter info | Small |
| 🟢 P5 | Bulk actions | Medium |
| 🟢 P5 | Duplicate report grouping | Large |

---

# Future Ideas & Roadmap

## Reader & Community Features (Engagement)
**Inline/Paragraph Comments**: Allow readers to comment directly on specific paragraphs (like Wattpad) or comic panels (like Webtoon). This drives high community engagement by letting readers react to specific plot twists.

**Offline Reading Mode (PWA)**: Turn KathaSangam into a Progressive Web App (PWA) so readers can download novel chapters or comic pages to read offline during commutes.

**Interactive Reactions**: Add a quick emoji/reaction bar (e.g., ❤️, 😮, 😢, 😂) at the end of each chapter so readers can instantly react to the story.
## Studio & Creator Tools (Author Empowerment)
**Advanced Analytics Dashboard**: Provide authors with charts showing views over time, reader retention per chapter (detecting exactly where readers drop off), and aggregate genre popularity.

**Scheduled Publishing**: Let authors upload multiple chapters in advance and set them to automatically publish on specific dates and times.

**Collaborative Co-Authoring**: Allow authors to invite co-writers or editors to review drafts, leave internal review notes, and edit stories collaboratively before they are made public.
## Monetization & Support (Creator Economy)
**Early Access / Paywalls**: Introduce a coin/token system where readers can purchase tokens to unlock upcoming chapters early (e.g., read Chapter 5 a week before it releases for free).

**Direct Creator Tips/Donations**: Embed a micro-donation portal (e.g., Stripe, Buy Me a Coffee) directly on the author's profile page and at the end of their stories.
## Moderation & Platform Safety (Advanced Admin)
**Automated AI Toxicity Screening**: Automatically scan newly uploaded chapters and comments using sentiment/toxicity APIs to flag spam, hate speech, or inappropriate content before it even reaches the moderation queue.

**Detailed Audit Log Search & Filter**: Enhance the moderation logs page with advanced filters by moderator ID, action type, and date range for administrative accountability.

---

## UPI Implementation

> **Goal**: Embed a UPI donation QR code directly on the **Profile header card** and the **Story header card**, allowing readers to scan and donate to creators via any UPI app (Google Pay, PhonePe, Paytm, BHIM, etc.).

### How UPI Donations Work (No Payment Gateway Needed)

UPI (Unified Payments Interface) allows peer-to-peer payments using a simple **UPI ID** (also called VPA — Virtual Payment Address), e.g. `creator@paytm`, `author123@ybl`, `writer@oksbi`.

```
Reader sees QR code on profile/story page → Scans with any UPI app → Pays directly to creator's bank account
```

> **No Stripe, Razorpay, or any payment gateway is required.** UPI QR codes encode a standard deep link that any UPI app can read. The payment goes directly from reader's bank to creator's bank. KathaSangam simply generates the QR code — it never touches the money.

#### UPI Deep Link Format

Every UPI QR code encodes a URL in this standard format:

```
upi://pay?pa=CREATOR_UPI_ID&pn=CREATOR_NAME&cu=INR&tn=TRANSACTION_NOTE
```

| Parameter | Description | Required | Example |
|-----------|-------------|----------|---------|
| `pa` | Payee UPI ID (VPA) | ✅ Yes | `author123@paytm` |
| `pn` | Payee display name | ✅ Yes | `Rahul Sharma` |
| `cu` | Currency code | ✅ Yes | `INR` |
| `tn` | Transaction note | ❌ Optional | `Donation for AuthorName on KathaSangam` |

> **Amount is intentionally omitted** from the QR code. This makes the donation open-ended — the donor types whatever amount they wish in their UPI app. It's completely up to the reader how much they want to give.

#### QR Code Generation (Client-Side)

QR codes are generated **entirely in the browser** using a lightweight JavaScript library — no server calls needed.

**Library**: [qrcode.js](https://github.com/davidshimjs/qrcodejs) (< 10KB, zero dependencies, works via `<script>` tag)

```html
<script src="/js/vendor/qrcode.min.js"></script>
```

```javascript
var upiUrl = "upi://pay?pa=author@paytm&pn=Author Name&cu=INR&tn=Tip on KathaSangam";
var qr = new QRCode(document.getElementById("qr-container"), {
    text: upiUrl,
    width: 200,
    height: 200
});
```

---

### Step-by-Step Implementation Process

#### Step 1: Database Migration — Store Creator UPI ID

Add a `upi_id` column to the `profiles` table so authors can save their UPI address.

**[NEW]** `backend/migrations/0019_upi_donation.sql`

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS upi_id TEXT DEFAULT '';
```

> This is the only database change needed. No earnings dashboard, no tip tracking tables. Pure peer-to-peer — KathaSangam just displays the QR code.

---

#### Step 2: Backend — Update Profile Model & Routes

Allow creators to save/display their UPI ID through the profile API.

**[MODIFY]** `backend/src/routes/profile.rs`

- Add `upi_id: String` to `PublicProfileResponse` and `ProfileResponse` structs
- Add `upi_id: Option<String>` to `UpdateProfileRequest` struct
- Update SQL SELECT queries in `get_profile()` and `get_public_profile()` to include `upi_id`
- Update SQL UPDATE query in `update_profile()` to add `upi_id = COALESCE($N, upi_id)`

**[MODIFY]** `backend/src/models.rs`

- Add `author_upi_id: String` to `StoryResponse` struct

**[MODIFY]** `backend/src/routes/stories.rs`

- Join `profiles.upi_id` in `build_story_responses_batch` query and map to `author_upi_id` in response

---

#### Step 3: Add QR Code Library

**[NEW]** `js/vendor/qrcode.min.js` — Client-side QR code generation library (< 10KB)

**[MODIFY]** `index.html` — Add `<script src="/js/vendor/qrcode.min.js"></script>` in vendor scripts section

---

#### Step 4: Frontend — UPI ID in Profile Settings

Let authors configure their UPI ID in their profile settings page.

**[MODIFY]** `js/views/profile.js`

- Add a new `settings-group` after Bio settings in the Settings tab with:
  - Label: "💳 UPI Donation Settings"
  - Hint text explaining the feature
  - Input field for UPI ID (placeholder: `e.g. yourname@paytm`)
  - Save button
  - Status indicator (green dot = active, grey dot = not configured)

**[MODIFY]** `js/controllers/profileController.js`

- Add `updateUpiId` action handler:
  - Validate UPI ID format with regex: `/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/`
  - Call `ctx.apiPut("/profile", { upiId: value })`
  - Show success/error toast

---

#### Step 5: Frontend — QR Code on Profile Header Card

Show the UPI QR code on the **right side** of the public profile header card.

**[MODIFY]** `js/views/profile.js`

- Add a right-side section inside the `profile-header-card` (only if author has `upiId` set):

```
┌─────────────────────────────────────────────────────┐
│  [Avatar]  Username / Role / Bio    │  [QR Code]   │
│            Followers · Following    │  UPI ID      │
│            [Follow] [Message]       │  [Pay btn]   │
└─────────────────────────────────────────────────────┘
```

- QR code generated client-side via `requestAnimationFrame` after DOM renders
- UPI ID displayed in monospace below the QR
- "💳 Pay via UPI" deep link button (opens UPI app on mobile)

---

#### Step 6: Frontend — QR Code on Story Header Card

Show the UPI QR code on the **right side** of the story details hero/header card.

**[MODIFY]** `js/views/story.js`

- Add a donation column on the right side of `.story-header-card` (only if `story.authorUpiId` exists):

```
┌───────────────────────────────────────────────────────────┐
│  [Cover]  Title / Author / Genre     │  [QR Code]        │
│           Stats (reads, likes, etc)  │  Support Author   │
│           [Start Reading] [Bookmark] │  UPI ID           │
│                                      │  [Pay via UPI]    │
└───────────────────────────────────────────────────────────┘
```

- Compact QR code (160×160)
- "☕ Support the Author" label
- UPI ID in monospace
- "💳 Pay via UPI" deep link button

---

#### Step 7: CSS Styling — Premium Donation UI

**[MODIFY]** `css/community.css` — Profile page UPI styles:
- `.profile-upi-section` — Right-aligned flex column inside header card
- `.upi-qr-container` — White-background rounded container with subtle shadow
- `.upi-id-display` — Monospace text with muted color
- `.upi-pay-btn` — Orange gradient button with hover lift effect
- `.upi-preview-badge` — Active/inactive status dot for settings

**[MODIFY]** `css/layout.css` — Story page UPI styles:
- `.story-upi-section` — Right-aligned flex column inside story header card
- Compact QR container variant
- Responsive: QR section stacks below story info on mobile

---

#### Step 8: Mobile UPI App Deep Link Integration

On mobile devices, tapping "Pay via UPI" opens the user's installed UPI app directly via the `upi://` scheme:

```javascript
function openUpiPayment(upiUrl) {
    window.location.href = upiUrl;
    // Fallback: if no UPI app installed, show QR code message
    setTimeout(function() {
        ctx.notify("No UPI app detected. Please scan the QR code instead.", "info");
    }, 2000);
}
```

> On desktop browsers, `upi://` links won't open any app — that's why the **QR code is the primary interface**. On mobile, both the QR code and the direct "Pay via UPI" button work.

---

### Files Changed Summary

| Action | File | Description |
|--------|------|-------------|
| [NEW] | `backend/migrations/0019_upi_donation.sql` | Add `upi_id TEXT DEFAULT ''` to `profiles` |
| [MODIFY] | `backend/src/routes/profile.rs` | Add `upi_id` to response/request structs and SQL queries |
| [MODIFY] | `backend/src/models.rs` | Add `author_upi_id` to `StoryResponse` |
| [MODIFY] | `backend/src/routes/stories.rs` | Join `profiles.upi_id` in story queries |
| [NEW] | `js/vendor/qrcode.min.js` | Client-side QR code generation library |
| [MODIFY] | `index.html` | Add qrcode.min.js script tag |
| [MODIFY] | `js/views/profile.js` | UPI settings + QR code on public profile header |
| [MODIFY] | `js/controllers/profileController.js` | `updateUpiId` action handler |
| [MODIFY] | `js/views/story.js` | QR code on story header card |
| [MODIFY] | `css/community.css` | Profile UPI donation styles |
| [MODIFY] | `css/layout.css` | Story header UPI donation styles |
