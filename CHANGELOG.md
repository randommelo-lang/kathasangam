# Changelog

All notable changes to the KathaSangam platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.5] - 2026-10-14

### Added
- **Dedicated About Section (`#about`)**:
  - Continuous single-page markdown document layout highlighting platform vision across India and regional literature.
  - Interactive Table of Contents bar (`.about-toc-bar`) with smooth scrolling to sections (`#mission-vision`, `#platform-guide`, `#rules-guidelines`, `#open-source-stack`, `#community-channels`).
  - Section 01: Mission & Vision for serialized fiction and dual formats (Web Novels & Chitrānk webcomics).
  - Section 02: Platform Guide covering reader comfort, library playlists, author studio, creator tipping, and community safety.
  - Section 03: Standards & Community Guidelines emphasizing 100% creator IP/copyright ownership, mandatory NSFW content rating tags, and civil discussions.
  - Section 04: Open Source Technology Stack acknowledging Rust, Axum, Tokio, SQLx, PostgreSQL, Supabase, Mammoth.js, PDF.js, Inter, JetBrains Mono, and [itshover](https://github.com/itshover/itshover).
  - Section 05: Official Community & Social Media Channels with dedicated redirect cards and external links.
  - Discover toolbar icon-only About SVG button (`i` inside a circle) in both loaded and skeleton states.
  - First-time visitor welcome modal with India-focused mission and community channels strip.
- **Creator Wallet & Razorpay Tipping System**:
  - Full **Creator Wallet (`#wallet`)** dashboard displaying available balance, total net earnings, total withdrawn, and transparent 5% platform fee note.
  - Razorpay payment gateway integration supporting UPI, RuPay, and Cards with simulated and production verification.
  - Story and reader donation modal with preset chips (₹50, ₹100, ₹250, ₹500, Custom) and end-of-chapter tip callout.
  - Supporter badge displayed in chapter discussions and user profiles for tipping readers.
  - Direct UPI payout request flow with minimum withdrawal threshold validation and destination UPI ID setting.
  - Transaction history ledger recording tips, donor names, fees, and payout statuses.
  - Database Migration `0026_wallet_and_razorpay_tips.sql`.
- **Persistent Notifications with 3-Month Retention**:
  - Database Migration `0027_notification_retention_and_indexes.sql`:
    - Composite database indexes `(user_id, created_at DESC)` and `(created_at)`.
    - Rolling 90-day automatic retention window pruning entries older than 3 months.
  - Backend API endpoints `PATCH /api/notifications/:id/read` and `PATCH /api/notifications/read-all`.
  - Non-destructive clicks: reading a notification marks it read while preserving it in history.
  - Dynamic relative timestamps and unread-only bell badge indicator.
- **Custom Vector SVG Assets for Community Channels**:
  - Added dedicated SVG assets for all official channels: `icons/Nyburs.svg`, `icons/Vync.svg`, `icons/twitter-x-icon.svg`, `icons/gmail-icon.svg`, and `icons/github-icon.svg`.
  - Dynamic URL overrides via environment variables (`SOCIAL_NYBURS_URL`, `SOCIAL_VYNC_URL`, `SOCIAL_TWITTER_URL`, `SOCIAL_GITHUB_URL`, `SUPPORT_EMAIL`) through `GET /api/config`.

### Changed
- **Router Resilience for Section Anchors**: Updated `getRoute()` in `js/router.js` to recognize section anchor hashes (`#mission-vision`, `#platform-guide`, `#rules-guidelines`, `#open-source-stack`, `#community-channels`) as child sections of `#about` rather than falling back to `#discover`.
- **Zero-Emoji Policy**: Enforced strictly zero emojis across the About page, Discover toolbar, modal popups, section badges, and button labels in favor of typography and clean SVGs.
- **Theme-Aware Icon Contrast**: Implemented CSS filter rules in `css/about.css` and `css/layout.css` ensuring custom SVG icons adapt cleanly to both dark and light themes.

### Fixed
- Fixed in-page Table of Contents pills in `about-toc-bar` triggering hash changes that caused SPA route redirect to `#discover`.
- Fixed JSX syntax artifacts in `icons/gmail-icon.svg` (`initial={{ ... }}` and `<path } ...>`) preventing native browser rendering.
- Fixed Discover toolbar skeleton layout where the About button was not rendered before story data arrived.
- Restored `renderWallet()` route invocation in `js/router.js`.

---

## [0.5.0] - 2026-10-14

### Added
- **URL-Based Password Recovery Flow**:
  - Replaced the 6-digit OTP code prompt with an email password reset link (`resetPasswordForEmail`) with `redirectTo`.
  - Added a dedicated **"Check Your Email"** confirmation card (`#forgotPasswordSentState`) with a vector SVG mail icon, recipient email address display, and an interactive **"Resend Reset Link"** button.
  - Added automatic deep-linking for `PASSWORD_RECOVERY` events and `#reset-password` / `type=recovery` URL fragments, opening the "Reset Password" form directly.
- **Account Settings & Privacy Dashboard Redesign**:
  - Re-architected `#settings` into a 2-column creator/reader dashboard layout with elevated cards and a sticky navigation rail.
  - Added 100% vector SVG icons across all settings sections (strictly zero emojis).
  - Added interactive iOS-style toggle switches (`.toggle-switch` & `.toggle-slider`) for email and in-app notifications.
  - Added **Avatar Studio** with live preview, circular gradient border, file constraint indicators, and right-aligned action buttons (`Upload Photo` and `Remove Photo`).
  - Added real-time username availability checker with `@` prefix decoration.
  - Added **Reading & Content Preferences** card for theme (Light/Dark), reading mode (Scroll/Pages), font size (16–26px), Date of Birth, and age-adaptive NSFW filters.
  - Added **Two-Factor Authentication (2FA)** management with status badges and one-click enrollment/disable actions for TOTP and Email OTP.
  - Added **User Data Export** and **Danger Zone** with account deletion confirmation dialog.
- **Reader Experience & Navigation Enhancements**:
  - Added **Fullscreen Reader Mode** that presents only reader content without header/footer distractions, maintaining continuous scroll or paged navigation.
  - Replaced the reader settings drawer with a floating dropdown menu positioned directly beneath the settings trigger button.
  - Added **Two-Page Spread** layout for Chitrānk comic reading with zero gap, responsive panel fit, and contained image zoom.
  - Added **YouTube-Style Recursive Comment Tree** supporting arbitrary multi-level nested replies, Twitter-style progress ring, inline reply composers, and instant optimistic updates without jumping to top.
  - Added **TRENDY Recommendations Sidebar** on the reader view featuring rank numbers, view counters, flame icons, and title/author metadata.
- **Author Studio & Story Features**:
  - In-built distraction-free text editor with real-time word counting and autosave.
  - Document extraction supporting `.docx` (via Mammoth.js) and raw text files.
  - Chitrānk chapter image importer with drag-and-drop page reordering and thumbnail previews.
  - Scheduled chapter publishing modal with datetime picker and status tracking.
  - Story content rating badges (All Ages, 13+, 16+, 18+) and interactive community ratings.
- **Database Migrations**:
  - `0022_story_ratings.sql`: Interactive story ratings and aggregate calculation.
  - `0023_add_content_rating_to_stories.sql`: Content age classification ratings.
  - `0024_enable_rls_missing_tables.sql`: Row-Level Security enforcement across all public tables.
  - `0025_tip_amount_bounds.sql`: Safe tipping constraints and author earnings validation.

### Changed
- Replaced Meilisearch search pipeline with high-performance native PostgreSQL full-text search.
- Modularized frontend JavaScript architecture into isolated ES modules (`js/auth/`, `js/controllers/`, `js/views/`, `js/editor/`).
- Streamlined `.env.example` by removing unnecessary internal flags and verbose audit comments.
- Strengthened `.gitignore` to protect all environment secret variations (`.env`, `.env.*`), local database files, logs, and user upload directories.

### Fixed
- Fixed comment reply button jump-to-top bug by preventing default anchor scroll behavior and scrolling smoothly to the active composer.
- Fixed comment editor visibility on reply submission.
- Fixed fullscreen reader layout where top controls and reading progress were cut off or misaligned.
- Fixed account menu and dropdown z-index layering issues on mobile devices.
- Fixed `redirectTo` parameter format by removing illegal URI fragments (`#`) that triggered Supabase 500 mail delivery errors.

### Security
- Hardened JWT verification by pre-parsing EC public keys at application startup.
- Added strict rate limiting with governor middleware.
- Enforced PostgreSQL Row-Level Security (RLS) on all user data, bookmarks, progress, and settings.
- Added comprehensive Content Security Policy and security headers middleware.

### Testing & Quality Assurance
- Expanded Playwright automated test suite to **33 end-to-end tests** covering:
  - Responsive layout, navigation, and mobile bottom bar.
  - URL-based password recovery and confirmation cards.
  - Two-factor authentication (TOTP & Email OTP).
  - Reader full-screen, themes, paged modes, two-page spreads, and nested comments.
  - Author studio creation, editing, scheduling, and document extraction.
- Enforced strict project checks: ESLint, Prettier formatting check, TypeScript typecheck, and Node syntax validation.
