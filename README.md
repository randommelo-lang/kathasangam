# KathaSangam

KathaSangam is a web publishing platform for serialized **Web Novels** and **Chitrānk**. Readers can discover, follow, read, bookmark, and discuss stories; authors can write, schedule, and publish chapters; moderators can review reports and manage community safety.

The project is a vanilla JavaScript single-page application backed by a Rust/Axum API. Supabase provides authentication and PostgreSQL, while Meilisearch provides full-text story search.

## What is included

- Discovery with text search, genres, language/type/status filters, sorting, and NSFW visibility preferences.
- Text and Chitrānk readers with scroll/page modes, comfort controls, comments, likes, progress saving, and chapter access states.
- Author Studio for story metadata, text/Chitrānk chapter editing, file import, draft recovery, scheduling, analytics, collaborators, and internal notes.
- Library features: followed stories, bookmarks, reading progress, notifications, and reading lists.
- Community features: public profiles, author follows, direct messages, tips, and reports.
- Moderation tools for report review, bulk actions, audit logs, keyword scans, and user bans.
- Backend safeguards including JWT validation, role/ownership checks, rate limiting, CORS allowlisting, security headers, structured request logs, and image-upload validation/compression.

## Architecture

```text
Browser SPA (HTML, CSS, ES modules)
            │  /api/*
            ▼
Rust Axum API ──────► Supabase PostgreSQL
      │       └─────► Supabase Auth (JWT)
      ├─────────────► Meilisearch
      └─────────────► local /uploads media directory
```

For local development, the backend also serves the frontend files, so the unified local URL is `http://localhost:3000`.

> **Security note:** this combined server is a local-development convenience, not the preferred production boundary. The backend currently serves the frontend from its parent project directory; do not expose a development checkout this way. In production, deploy the static frontend from a dedicated public build directory (or static host) and expose only the API and upload paths from the Rust service. Keep `.env` files, source code, Git metadata, test artifacts, and other non-public files outside any web-served directory.

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | HTML, CSS, vanilla JavaScript ES modules |
| Backend | Rust, Axum, Tokio, SQLx |
| Database and identity | Supabase PostgreSQL and Supabase Auth |
| Search | Meilisearch |
| Browser tests | Playwright |
| Deployment configuration | Render |

## Repository layout

```text
.
├── index.html              # SPA shell and static dialogs
├── js/                     # views, controllers, editor, auth, API client
├── css/                    # feature-oriented stylesheets
├── icons/                  # application icons and static visual assets
├── backend/
│   ├── src/                # Axum app, routes, middleware, models, search
│   ├── migrations/         # PostgreSQL/Supabase schema migrations
│   └── uploads/            # locally served uploaded media
├── tests/                  # Playwright end-to-end tests and helpers
└── render.yaml             # Render API and static-frontend deployment
```

## Prerequisites

- Rust stable with Cargo
- Node.js 18+ and npm
- Python 3 for the Playwright test setup helpers
- A Supabase project with PostgreSQL and Auth configured
- Meilisearch for production-quality story search (recommended)

## Configuration

Copy the sanitized template to create your local configuration, then replace every placeholder with your own credentials:

```powershell
Copy-Item backend/.env.example backend/.env
```

See [backend/.env.example](backend/.env.example) for the required API, Supabase, Meilisearch, role, and optional runtime-security variables. Never commit `backend/.env` or its credentials.

`SUPABASE_JWT_SECRET` is named for compatibility with the deployment configuration; the backend uses it as the ES256 PEM decoding key for Supabase access tokens. The API applies the SQL migrations in `backend/migrations/` during startup.

## Run locally

Install the browser-test dependency once:

```powershell
npm install
```

Start Meilisearch if available, then start the backend from its directory:

```powershell
cd backend
cargo run
```

Open [http://localhost:3000](http://localhost:3000). The API is available at `http://localhost:3000/api` and uploads at `http://localhost:3000/uploads`.

The frontend receives its Supabase public configuration from `GET /api/config`; serving `index.html` alone is therefore only useful for static layout work, not for authenticated application flows.

## Tests

The Playwright suite expects the backend to be available on port `3000` and includes setup/teardown helpers that create and remove test data.

```powershell
npm test
```

Useful alternatives:

```powershell
npm run test:headed
npm run test:ui
```

Run the tests only against a safe development or dedicated test Supabase project: they create accounts, stories, bookmarks, reading lists, messages, and NSFW preference data.

## API overview

All application routes are under `/api`.

| Area | Example routes |
| --- | --- |
| Stories and chapters | `/stories`, `/stories/:id`, `/stories/:id/chapters`, `/chapters/:id` |
| Reader interactions | `/comments`, `/progress`, `/bookmarks`, `/library`, `/reading-lists` |
| Community | `/profiles/:username`, `/follow/user/:id`, `/messages`, `/notifications` |
| Author collaboration | `/stories/:id/collaborators`, `/stories/:id/internal-notes` |
| Moderation | `/reports`, `/moderation/ban`, `/moderation/scan` |
| Platform | `/config`, `/health`, `/upload/image`, `/stats` |

Authenticated requests use a Supabase bearer token:

```http
Authorization: Bearer <supabase-access-token>
```

Consult `backend/src/main.rs` for the complete route map and `backend/src/models.rs` for request/response shapes.

## Deployment

- `render.yaml` deploys the Rust API and a static frontend on Render.

Keep the API hostname, `ALLOWED_ORIGINS`, Supabase redirect URLs, and Meilisearch settings aligned for each environment.

## Open-source acknowledgements

KathaSangam is built with open-source software. We are grateful to the maintainers and contributors of these projects:

| Project | How it is used |
| --- | --- |
| [Axum](https://github.com/tokio-rs/axum), [Tokio](https://tokio.rs/), [Tower](https://github.com/tower-rs/tower), [Tower HTTP](https://github.com/tower-rs/tower-http) | Rust web server, asynchronous runtime, and HTTP middleware |
| [SQLx](https://github.com/launchbadge/sqlx), [Serde](https://serde.rs/), [Serde JSON](https://github.com/serde-rs/json), [Chrono](https://github.com/chronotope/chrono), [UUID](https://github.com/uuid-rs/uuid), [Bytes](https://github.com/tokio-rs/bytes) | PostgreSQL access, serialization, time handling, identifiers, and byte buffers |
| [Reqwest](https://github.com/seanmonstar/reqwest), [jsonwebtoken](https://github.com/Keats/jsonwebtoken), [base64](https://github.com/marshallpierce/rust-base64), [dotenvy](https://github.com/allan2/dotenvy), [Governor](https://github.com/boinkor-net/governor), [Tracing](https://github.com/tokio-rs/tracing) | HTTP client, JWT handling, configuration, rate limiting, and observability |
| [Supabase](https://supabase.com/) and [supabase-js](https://github.com/supabase/supabase-js) | Authentication, PostgreSQL integration, storage integration, and browser client |
| [Meilisearch](https://github.com/meilisearch/meilisearch) | Story search indexing and full-text search |
| [PDF.js](https://github.com/mozilla/pdf.js) | Browser PDF parsing and Chitrānk/text import support |
| [Mammoth.js](https://github.com/mwilliamson/mammoth.js) | Browser DOCX text extraction for chapter imports |
| [QRCode.js](https://github.com/davidshimjs/qrcodejs) | Bundled QR-code generation utility |
| [Itshover](https://github.com/itshover/itshover) | SVG icon assets used in the interface |
| [Playwright](https://playwright.dev/) | End-to-end browser testing |

The browser bundles currently checked into `js/vendor/` are documented with their exact versions and integrity hashes in [js/vendor/README.md](js/vendor/README.md). Each dependency remains subject to its own license and notice requirements; this table is an acknowledgement, not a replacement for those licenses.

## Documentation

- [Idea.md](Idea.md) — product vision and longer-term architecture.
- [plan.md](plan.md) — implementation history, open quality items, and roadmap.
- [security.md](security.md) — security audit and completed remediations.

## License

Copyright © 2026 KathaSangam. All rights reserved.
