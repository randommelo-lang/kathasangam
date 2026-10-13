# Changelog

All notable changes to the KathaSangam platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
