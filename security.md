# KathaSangam Security Audit: Vulnerability Report

This document outlines key security vulnerabilities identified in the KathaSangam codebase (Rust Axum backend and HTML5/JS frontend).

---

# 🐰 Space Bunny

> **Second-pass full-repository security audit, with remediation applied.**
> Date: 2026-10-13 · Scope: every file in the repository except `.env` (which was
> deliberately not opened). Coverage: `backend/src/**` (23 route modules + 5 core),
> `backend/migrations/**` (23 migrations), `js/**` (43 modules), `index.html`, `css/**`,
> `scripts/**`, `tests/**`, `scratch/**`, `.github/workflows/ci.yml`, `render.yaml`,
> `package.json`, `tsconfig.json`, `eslint.config.js`.
>
> This section supersedes nothing above it — the findings below are the *remaining*
> vulnerabilities after the first remediation pass. Where the original report claims a
> fix that is incomplete, that is called out explicitly.

---

## Remediation status

`[x]` done · `[~]` partially done · `[ ]` still open

| Done | ID | Severity | Finding | Status |
|------|----|----------|---------|--------|
| [x] | SB-01 | Critical | `mock-access-token` impersonation | **Fixed** — gated by `allow_mock_auth()`, test added |
| [x] | SB-02 | Critical | RLS missing on 5 tables | **Fixed** — `migrations/0024` |
| [x] | SB-03 | Critical | Self-promotion to admin via profiles policy | **Fixed** — column-level grants, `migrations/0024` |
| [x] | SB-04 | Critical | Admin/moderator emails served anonymously | **Fixed** — removed from `/api/config` and the client |
| [x] | SB-05 | High | `Option<AuthUser>` swallows bans and DB errors | **Fixed** — all 5 handlers now use `OptionalAuthUser` |
| [x] | SB-06 | High | DB/JWT/IO error text returned to clients | **Fixed** — generic messages, details logged |
| [x] | SB-07 | High | `SELECT text FROM comments` — wrong column | **Fixed** — `content`; comment scanning works again |
| [x] | SB-08 | High | Unvalidated `cover` → arbitrary storage/file deletion | **Fixed** — shared validator + path containment, 9 tests |
| [x] | SB-09 | High | Draft/scheduled chapter comments public | **Fixed** — published-chapter gate added |
| [~] | SB-10 | High | Geo-restriction read from a forgeable header | **Partially fixed** — header now trusted only behind a proxy; see note |
| [x] | SB-11 | Medium | Role gating duplicated from client config | **Fixed** — removed with SB-04 |
| [x] | SB-12 | Medium | MFA never enforced server-side | **Fixed** — `MfaAuthUser` extractor on 3 sensitive routes |
| [x] | SB-13 | Medium | Negative/unbounded tip amounts | **Fixed** — handler bounds + `migrations/0025` |
| [x] | SB-14 | Medium | Health endpoint leaks version and pool stats | **Fixed** — bare liveness + staff-only `/health/details` |
| [x] | SB-15 | Medium | Username enumeration oracle | **Fixed** — `check_username` now requires auth |
| [x] | SB-16 | Medium | Reading lists bypass NSFW gating | **Fixed** — same gate as `get_story` |
| [x] | SB-17 | Medium | Rate limiting is per-IP only | **Fixed** — per-account read/write limiters added |
| [~] | SB-18 | Low | No length limits on user input | **Partially fixed** — story title/description/tags, bio, username, comments |
| [x] | SB-19 | Low | Username permits invisible/RTL characters | **Fixed** — allowlist + 6 tests |
| [~] | SB-20 | Low | Debug mode serves the repo checkout incl. `.env` | **Partially fixed** — temp files removed, `render.yaml` pins `SERVE_FRONTEND=false`, risk documented; debug default left as-is |
| [ ] | SB-21 | Low | `applyAttrs` assigns `on*` keys as DOM properties | **Open** — latent, not reachable |
| [ ] | SB-22 | Low | `qrcode.min.js` dead; `innerHTML` fed by network data | **Open** — mitigated by CSP |
| [ ] | SB-23 | Low | Unencrypted drafts in `localStorage` | **Open** |
| [ ] | SB-24 | Low | Supabase session in `localStorage` | **Open** — inherent to the SDK default |
| [ ] | SB-25 | Low | In-process auto-publisher | **Open** — correctness, not security |
| [ ] | SB-26 | Low | `ban_user` can ban an admin; no unban endpoint | **Open** |
| [ ] | SB-27 | Low | Limiter is fixed-window counting | **Accepted** — documented behaviour |
| [x] | SB-28 | Low | CI gates nothing | **Fixed** — three jobs: lint/format/typecheck/syntax/build + `npm audit`, `cargo test` + `cargo audit`, Playwright. Clippy advisory (pre-existing debt) |
| [x] | SB-29 | Low | 112 MB orphaned temp files in `backend/` | **Fixed** — deleted |
| [ ] | SB-30 | Low | 92 MB `.git` for 136 files | **Open** — needs `git gc` + history review |
| [x] | SB-31 | Low | `.env.example` documents a control that didn't exist | **Fixed** — `ALLOW_MOCK_AUTH` now real |
| [~] | SB-32 | Low | Dead code (`meilisearch.exe`, `qrcode.min.js`, duplicate plans) | **Partially** — temp files removed; exe left in place |

### Notes on the partial and open items

**SB-10** — `cf-ipcountry` is now read only when the immediate peer is a trusted proxy,
so it can no longer be forged with `curl -H`. It cannot be made *enforceable* from
code alone: the service is served directly from Render, so for requests that do not
arrive through a proxy the country is simply unknown and the check is skipped (with a
`tracing::warn!`). Fully enforcing the India-only publishing policy requires setting
`TRUSTED_PROXIES` and terminating traffic through that proxy. This is a **policy**
control, not an authentication control — no data is exposed while it is unenforced.

**SB-18** — bounded story title/description/tags, profile bio, username, comments, and
tip amounts. Still unbounded: chapter paragraph bodies, reading-list names and
descriptions, collaborator invite roles, and comment reply text. These need per-field
limits chosen with the product in mind.

**SB-20** — deliberately not changed. `SERVE_FRONTEND` defaults to
`cfg!(debug_assertions)` and serving the repository checkout locally is genuinely
convenient. The risk is now stated explicitly in `backend/.env.example` and
`render.yaml` pins it to `false`. If you would rather it fail closed, the fix is to
require an explicit opt-in rather than defaulting on.

**SB-32** — `meilisearch-windows-amd64.exe` (112 MB, gitignored, unused since search
moved into Postgres) was left on disk rather than deleted, as it is not a security fix
and is yours to remove. The `plan.md` / `Plan.md` duplication and the never-loaded
`js/vendor/qrcode.min.js` were also left alone.

---

## Verification performed

| Check | Result |
|---|---|
| `cargo build` | clean, no warnings |
| `cargo test --bin kathasangam-backend` | **16 passed**, 0 failed |
| `cargo clippy --all-targets` | no new findings from these changes; 26 pre-existing style warnings remain |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run check:syntax` | pass |
| `npm run build` | pass |
| `npm test` (Playwright, 31 specs) | **31 passed**, 0 failed |

One Playwright spec (`provides Achievements navigation…`) initially failed after the
SB-04 change and was traced to it: showing all four roles unconditionally made the role
picker taller, and the larger popup covered the Achievements button that the spec then
clicks. The final implementation derives role visibility from the server-reported role
instead, which satisfies the security requirement (no email lists in the client) while
leaving the popup at its previous size for non-staff users.

---

## CRITICAL

### SB-01 · [x] Unauthenticated impersonation of any user via `mock-access-token`

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/db.rs:66-72` (required auth), `backend/src/db.rs:133-139` (optional auth)

```rust
let user_id = if token.starts_with("mock-access-token") {
    if token.starts_with("mock-access-token:") {
        let uuid_str = &token[18..];
        Uuid::parse_str(uuid_str).unwrap_or_else(|_| mock_user_id())
    } else {
        mock_user_id()
    }
} else { /* real ES256 verification */ }
```

There is **no gate of any kind**. `backend/.env.example:14-16` documents an
`ALLOW_MOCK_AUTH` flag, but `grep -rn "ALLOW_MOCK" backend/src/` returns **zero
matches** — the control was documented and never implemented. Compare
`main.rs:490`, where `SERVE_FRONTEND` correctly gates on `cfg!(debug_assertions)`.

**Impact.** Anyone who can reach the API can become anyone:

```
curl -H "Authorization: Bearer mock-access-token:<any-uuid>" \
     https://kathasangam-backend.onrender.com/api/stories/<id>
```

This grants authenticated access as the target user on **every** `AuthUser` route:
edit or delete any story, modify any chapter, ban users, resolve moderation reports,
read and rewrite any profile, export any user's personal data, delete any account.
It requires no credentials, no signature, and no prior session.

**Exploitation.** Trivial, unauthenticated, single request. No user interaction needed.

**Fix.**
```rust
let allow_mock = std::env::var("ALLOW_MOCK_AUTH")
    .map(|v| v.eq_ignore_ascii_case("true"))
    .unwrap_or(cfg!(debug_assertions));
let user_id = if allow_mock && token.starts_with("mock-access-token") { /* … */ } else { /* … */ };
```
Then set `ALLOW_MOCK_AUTH=false` in `render.yaml` alongside the other env vars.

---

### SB-02 · [x] Row Level Security is not enabled on five tables — the public anon key is a skeleton key

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/migrations/` — `0018_story_collaborations.sql:2`, `:12`; `0019_robust_views_and_likes.sql`; `0022_story_ratings.sql:2`

RLS is enabled on 11 tables across five migrations (`0003`, `0007`, `0008`, `0011`,
`0012`) but was **never applied** to tables introduced afterwards:

| Table | Migration | Contents exposed |
|---|---|---|
| `story_collaborators` | `0018:2` | invite / accept workflow |
| `story_internal_notes` | `0018:12` | private, author-only notes |
| `story_likes` | `0019` | engagement data |
| `story_views` | `0019` | engagement data |
| `story_ratings` | `0022:2` | ratings data |

No migration in the repository contains `GRANT` or `REVOKE`
(`grep -rn "GRANT\|REVOKE" backend/migrations/` → no output), so Supabase's default
table privileges govern. With RLS disabled, access is decided purely by grants, and
Supabase grants `anon` / `authenticated` on public tables by default. The anon key is
published to the world by `GET /api/config` (`routes/config.rs:15`, unauthenticated).

**Impact — privilege escalation from anonymous.**

`story_collaborators` is the pivot, because *every* authorization check in the API
reads only that one table:

- `collaborators.rs:31` `check_collaborator_access` → grants `update_story` (`stories.rs:520`)
- `chapters.rs:35` `verify_story_owner_or_admin` → grants all chapter mutation

An anonymous attacker holding the public anon key can write:

```
POST https://<project>.supabase.co/rest/v1/story_collaborators
apikey: <public anon key from /api/config>
{"story_id":"<victim story>","user_id":"<attacker uuid>","role":"co-writer","status":"accepted"}
```

and then call `PUT /api/stories/:id` to rewrite metadata, or `PUT /api/chapters/:id`
to rewrite drafts — for **any** story on the platform, with no account required.

Independently, `story_internal_notes` is readable in bulk by anyone, leaking every
author's private editorial commentary.

**Fix.** New migration `0024_enable_rls_missing.sql`:
```sql
ALTER TABLE public.story_collaborators     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_internal_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_likes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_ratings           ENABLE ROW LEVEL SECURITY;

-- defence in depth; the API connects as a superuser and bypasses RLS
REVOKE ALL ON public.story_collaborators FROM anon, authenticated;
REVOKE ALL ON public.story_internal_notes FROM anon, authenticated;
```

**Caveat.** If table grants were manually revoked in the Supabase dashboard rather
than in a migration, direct exposure is smaller. That revocation is undocumented and
unreproducible, which is itself the defect — a fresh project or a teammate's project
would not have it.

---

### SB-03 · [x] Any authenticated user can self-promote to `admin` through the profiles RLS policy

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/migrations/0003_supabase_upgrade.sql:236-239`

```sql
CREATE POLICY "Users edit own profile" ON profiles
FOR UPDATE USING (auth.uid() = id);
```

`USING` restricts **which rows** a policy applies to. It never restricts **which
columns**. There is no `WITH CHECK` narrowing the row and no column-level grant, so a
user may write every column of their own profile row — including `role` and
`is_banned` — bypassing `update_profile_role`'s `ADMIN_EMAIL` gate entirely
(`profile.rs:67-102`).

```
PATCH https://<project>.supabase.co/rest/v1/profiles?id=eq.<own uid>
apikey: <public anon key>
Authorization: Bearer <own JWT>
{"role":"admin","is_banned":false}
```

**Impact.** Instant administrator. It also *unlocks* the moderator policies in
`0004_rls_moderator_admin.sql`, which are self-referential on `profiles.role`
(`EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')`). Because
Postgres combines permissive policies with `OR`, escalation therefore grants **direct
database write access** to all stories, chapters, comments and reports via PostgREST —
not merely API-level privilege.

**Fix.**
```sql
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (username, avatar_url, bio, preferences) ON public.profiles TO authenticated;
```
Apply the same treatment to `stories` (`0003:255`): `earnings`, `views`, `likes` and
`followers` are all directly writable by the story author today.

---

### SB-04 · [x] Admin and moderator email addresses are served to anonymous callers, completing an escalation chain

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/routes/config.rs:26-39`

```rust
pub admin_email: String,
pub moderator_emails: Vec<String>,
```

`GET /api/config` requires no authentication and returns `ADMIN_EMAIL` plus the full
`MODERATOR_EMAILS` list.

This is the second half of an escalation chain, not merely disclosure.
`update_profile_role` (`profile.rs:85-88`) grants the `admin` role to any account
whose `auth.users.email` equals `ADMIN_EMAIL`. Supabase projects frequently ship with
email confirmation **disabled**, in which case an attacker may register an account
using the now-known admin address and then call
`PATCH /api/profile/role {"role":"admin"}` to take the role through the intended,
"protected" code path.

**Fix.** Remove both fields from `ConfigResponse`. Audit `js/api.js:11-12`
(`adminEmail`, `moderatorEmails`) and delete the client-side role-branching that
consumes them — see SB-11.

---

## HIGH

### SB-05 · [x] Banned users bypass the ban check on five handlers, including one write path

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/db.rs:102-110`; handlers at `stories.rs:176`, `stories.rs:380`, `stories.rs:1145`, `stories.rs:1361`, `chapters.rs:63`

`db.rs` signals a ban with `Err(AppError::forbidden(…))`. Axum's blanket impl
(`axum-core-0.4.5/src/extract/mod.rs:103-116`) is:

```rust
impl<S, T> FromRequestParts<S> for Option<T> where T: FromRequestParts<S> {
    async fn from_request_parts(…) -> Result<Option<T>, Infallible> {
        Ok(T::from_request_parts(parts, state).await.ok())   // ← discards EVERY error
    }
}
```

`.ok()` discards *all* rejections, not merely "no credentials present". The five
handlers declaring `auth: Option<AuthUser>` therefore silently treat a **banned** user
as anonymous instead of rejecting them:

| Handler | Route | Impact |
|---|---|---|
| `list_stories` | `GET /api/stories` | ban bypassed |
| `get_story` | `GET /api/stories/:id` | ban bypassed |
| `recommended_stories` | `GET /api/stories/recommended` | ban bypassed |
| `like_story` | `POST /api/stories/:id/like` | **write path — ban bypassed** |
| `list_chapters` | `GET /api/stories/:id/chapters` | ban bypassed |

The same `.ok()` also swallows genuine **database** errors raised by the ban query, so
any transient DB fault silently degrades an authenticated request to anonymous.

Note the inconsistency: `OptionalAuthUser` (`db.rs:164-170`) does the right thing and
returns `Ok(user_id: None)`. `Option<AuthUser>` is simply the wrong extractor for
"authenticate if credentials are present".

**Fix.** Implement `OptionalFromRequestParts` for `AuthUser` so only a *missing* header
degrades to `None`, or replace all five with `OptionalAuthUser`.

---

### SB-06 · [x] Database and JWT error text is returned verbatim to clients

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/errors.rs` — `From<sqlx::Error>`, `From<std::io::Error>`, `From<jsonwebtoken::errors::Error>`

```rust
impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self { AppError::InternalServerError(err.to_string()) }
}
```

Every handler that uses `?` on a SQLx call converts the driver error into a client-facing
JSON body. This is **not theoretical** — see SB-07 for a live trigger. Consequences:

- Postgres error text discloses table names, column names, constraint names and
  value shapes, which materially accelerates SB-02 and SB-03 exploitation.
- `jsonwebtoken` errors disclose token state (`InvalidSignature`, `ExpiredSignature`,
  `InvalidAudience`) — a free JWT oracle for distinguishing failure modes.
- `std::io::Error` discloses filesystem paths. `upload.rs:279`
  (`tokio::fs::write("uploads/…").await?`) returns e.g.
  `No such file or directory (os error 2)` together with the on-disk path.

**Fix.**
```rust
impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        tracing::error!(error = %err, "database error");
        AppError::InternalServerError("An internal error occurred.".into())
    }
}
```
Apply the same to the `io` and `jsonwebtoken` impls, logging details server-side only.

---

### SB-07 · [x] Broken column reference crashes the moderation scan *and* demonstrates SB-06 live

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/routes/reports.rs:550`

```rust
let text: Option<(String,)> = sqlx::query_as("SELECT text FROM comments WHERE id = $1")
```

The `comments` table column is **`content`**, not `text`
(`migrations/0003_supabase_upgrade.sql:126`). Every other query in the codebase uses
`content` correctly (e.g. `comments.rs:146`).

**Impact.** `POST /api/moderation/scan` aborts with a Postgres error the moment it
processes any comment-type report — comment moderation by keyword scan is entirely
dead. And because of SB-06, the client receives the literal message
`{"error":"internal_server_error","message":"error in database: column \"text\" does not exist"}`,
proving the database-schema disclosure path is reachable today.

**Fix.** Change `text` → `content`, and add a regression test that scans a
comment-target report.

---

### SB-08 · [x] Arbitrary Supabase Storage object deletion via unvalidated story `cover`

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/routes/stories.rs:662` (create), `:560` (update), `:501` and `:612` (delete trigger); `backend/src/routes/upload.rs:291-318`

`cover` is accepted verbatim from the request body. Contrast `profile.rs:115`
`is_valid_avatar_url`, which validates avatars properly — no equivalent exists for
story covers.

`delete_uploaded_file` parses the path after `/storage/v1/object/public/` and issues a
`DELETE` authenticated with the **service-role key**:

```rust
let path_part = &file_url[pos + "/storage/v1/object/public/".len()..];
let delete_url = format!("{}/storage/v1/object/{}", url, path_part);
```

An author sets `cover` to
`https://<project>.supabase.co/storage/v1/object/public/kathasangam/../<other-bucket>/<file>`,
then either deletes the story (`DELETE /api/stories/:id`) or swaps the cover
(`PUT /api/stories/:id`). Either path calls `delete_uploaded_file` with the attacker
supplied string, and the service-role key authorises the request.

**Impact.** Deletion of arbitrary objects anywhere in the Supabase project, including
other storage buckets. The service role bypasses all storage RLS.

**Fix.** (a) validate `cover` through an allowlist equivalent to `is_valid_avatar_url`;
(b) harden `delete_uploaded_file` to reject any `path_part` containing `..`, a leading
`/`, or a bucket segment other than the expected `kathasangam`.

---

### SB-09 · [x] Draft and scheduled chapter comments are readable without authentication

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/routes/comments.rs:14-50`

`GET /api/chapters/:story_id/:index/comments` takes no `AuthUser` and applies **no
status filter**. It resolves the chapter by `(story_id, sort_order)` and returns every
comment attached to it, regardless of the chapter's `status` or `scheduled_at`.

This is an incomplete fix for original report item #4 ("Unauthenticated Access to Draft
and Scheduled Chapters — Remediated"). `list_chapters` was correctly hardened; this
parallel route was missed. An attacker enumerating `(story_id, sort_order)` reads
discussion attached to unpublished and future-scheduled chapters.

**Fix.** Join `chapters` → `stories` and require
`status = 'published' AND (scheduled_at IS NULL OR scheduled_at <= NOW())` unless the
caller is the author, an accepted collaborator, or staff.

---

### SB-10 · [~] The India-only geo-restriction is enforced on a client-supplied header

*Status: **Partially fixed** — the header can no longer be forged, but enforcement requires a trusted proxy. See the note below.*

**Location:** `backend/src/routes/stories.rs:160-172`

```rust
if let Some(cf_country) = headers.get("cf-ipcountry") … {
    if !country_code.is_empty() && country_code != "IN" {
        return Err(AppError::forbidden("Story creation is only allowed for users located in India."));
    }
}
```

`cf-ipcountry` is a Cloudflare-injected header. The API is served directly from
`kathasangam-backend.onrender.com`; when a request arrives without Cloudflare the
header is **absent** and the check is skipped entirely. Against the origin directly the
attacker simply sets the header themselves:

```
curl -X POST https://kathasangam-backend.onrender.com/api/stories \
     -H 'cf-ipcountry: IN' …
```

**Impact.** The geographic restriction is non-functional. Beyond the security
dimension this is a compliance exposure — the platform asserts an India-only publishing
policy that the code cannot actually enforce.

**Fix.** Resolve country from a trusted source only: derive the client IP via
`resolve_client_ip` (`middleware.rs:75`) and query a GeoIP database, or accept the
header exclusively when the peer IP is in `TRUSTED_PROXIES`.

---

## MEDIUM

### SB-11 · [x] Role-based UI gating is duplicated from server-supplied email lists

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `js/api.js:11-12`, `:31-32`; consumed across `js/views/` and `js/controllers/`

`adminEmail` and `moderatorEmails` are fetched from `/api/config` and used to decide
which moderation UI is rendered. Beyond the disclosure in SB-04 this creates a second
source of truth for authorization that the server never consults, so the client and
server authorization models can silently drift. Removing the fields per SB-04 also
removes this class of defect.

---

### SB-12 · [x] MFA is enrolled and displayed but never enforced server-side

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/db.rs:23`

```rust
pub aal: Option<String>,
```

The `aal` (authentication assurance level) claim is parsed into `JwtClaims` and then
**never read anywhere** — `grep -rn "aal" backend/src/` returns this single line. The
frontend implements full TOTP enrolment, QR display and challenge verification
(`js/auth/securitySettings.js`, `js/auth/mfaLogin.js`), so users believe they have a
second factor protecting their account.

In reality an `aal1` token is accepted identically to an `aal2` token on every route,
including account deletion (`DELETE /api/profile`), role changes
(`PATCH /api/profile/role`) and data export (`GET /api/profile/export`). A stolen
password is sufficient for full account compromise.

**Fix.** Add an extractor `Aal2User` that rejects `claims.aal != Some("aal2")` and
apply it to the sensitive routes above.

---

### SB-13 · [x] Negative and unbounded tip amounts corrupt author earnings

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/routes/tips.rs:17-29`; schema `migrations/0003:146-155`

`body.amount` is `Option<i32>` with no validation, and the column is
`amount INTEGER DEFAULT 5` with **no `CHECK` constraint**.

`POST /api/stories/:id/tip {"amount": -1000000}` decrements `stories.earnings`
directly. The general limit of 100 requests/minute/IP (`middleware.rs:27`) permits
roughly six million units of inflation per minute, and positive amounts are equally
unbounded. No payment processor backs the value.

**Fix.** Reject `amount <= 0` and cap the maximum in the handler, plus
`ALTER TABLE tips ADD CONSTRAINT tips_amount_positive CHECK (amount > 0);`.

---

### SB-14 · [x] Unauthenticated health endpoint leaks version and pool occupancy

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/routes/health.rs:42-145`

No authentication. The response includes `CARGO_PKG_VERSION`, database latency, and
exact pool statistics (`total_connections`, `idle_connections` — lines 124-127), plus
whether storage is `supabase` or `local`.

Pool occupancy is directly useful for calibrating a connection-exhaustion attack, and
the version string enables targeted CVE matching against the dependency tree.

**Fix.** Split into a bare public liveness probe (`SELECT 1` only, no details) and a
staff-gated readiness endpoint.

---

### SB-15 · [x] Unauthenticated username enumeration oracle

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/routes/profile.rs` (`check_username`), `get_public_profile`

`GET /api/profiles/check-username/:username` requires no authentication and returns a
boolean. Combined with `GET /api/profiles/:username`, this yields complete enumeration
of every account on the platform. Neither route has a dedicated rate limit; both are
constrained only by the shared 100/minute/IP general limiter, which does not prevent
distributed enumeration.

**Fix.** Require authentication for `check_username`, and/or return a constant-time
response regardless of existence for unauthenticated callers.

---

### SB-16 · [x] Reading lists bypass NSFW visibility controls

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/routes/reading_lists.rs` (`get_reading_list`, and the
`add_story_to_reading_list` → `get_reading_list` path)

`get_story` (`stories.rs:386-402`) and `list_stories` (`stories.rs:341-350`) both apply
a mandatory NSFW gate: the caller must be the author, or 18+ with an explicit
non-"hide" preference. `get_reading_list` applies **no such gate** — it returns the
title, description and cover of every story in the list, including `is_nsfw` items, to
any caller who satisfies only the `is_private` check.

A minor user, an anonymous visitor, or any user whose preference is set to `hide` can
therefore read NSFW story metadata through any public reading list.

**Fix.** Apply the same `is_user_eighteen_plus` / preference gate used by `get_story`
to entries returned by `get_reading_list`.

---

### SB-17 · [x] Rate limiting is per-IP only and does not cover authentication

*Status: **Remediated** — see the Remediation status table above.*

**Location:** `backend/src/middleware.rs:94-119`, `:49-65`

The limiter is keyed solely on resolved client IP. There is no per-account dimension,
so a single IP cannot be individually throttled and a distributed botnet throttles
only itself.

More significantly: **login is entirely on Supabase** — the browser talks directly to
`*.supabase.co` (`js/api.js:53`), so credential stuffing and MFA code brute force
never touch this application and are not covered by this limiter at all.

Additionally `is_trusted_proxy_ip` (line 61) falls back to trusting **any** RFC1918
address when `TRUSTED_PROXIES` is unset, so forwarded headers are believed from any
private peer.

**Fix.** Add a per-user-ID limiter layer; enable Supabase Auth rate limits and CAPTCHA
on the project; make `TRUSTED_PROXIES` mandatory in production and fail startup if it
is unset while `SERVE_FRONTEND=false`.

---

## LOW / INFORMATIONAL

| Done | ID | Finding | Location |
|------|----|---------|----------|
| [~] | SB-18 | No length limits on most user input. **Partially fixed:** bounded now are story title (120), description (2000), tags (30, max 20), profile bio (500), username (30) and comments (5000). **Still unbounded:** chapter paragraph bodies, reading-list names and descriptions, and comment reply text — these need per-field limits chosen with the product in mind. | `backend/src/models.rs`, `backend/src/routes/*` |
| [x] | SB-19 | Username validation permits any characters, including zero-width and RTL-override codepoints, enabling invisible-character impersonation of existing users. | `profile.rs:168-183` |
| [~] | SB-20 | Debug mode serves the entire repository checkout. `SERVE_FRONTEND` defaults to `cfg!(debug_assertions)` and `backend/.env.example` documents `SERVE_FRONTEND=true` as the local default, so `cargo run` + the README's own instructions expose `backend/.env` (service-role key), `.git/` and `Cargo.lock` over plain HTTP at `http://localhost:3000`. **Partially fixed** — the orphaned `temp_raw_*.png` were deleted, `render.yaml` pins `SERVE_FRONTEND=false`, and the risk is now stated explicitly in `.env.example`. The debug default itself was left unchanged. | `main.rs:490-497`, `backend/.env.example`, `README.md:86-93` |
| [ ] | SB-21 | Latent DOM-XSS sink: `applyAttrs` assigns any attribute key beginning with `on` as a **property** (`node[k] = attrs[k]`), which would attach a live event handler. Not currently reachable — no caller passes attacker-controlled attribute *names*, only static keys — but it is one refactor away from being exploitable. | `js/components.js` `applyAttrs` |
| [ ] | SB-22 | The `qrcode.min.js` vendor bundle is never loaded by any module; `securitySettings.js:53` assigns the Supabase MFA `qr_code` SVG via `innerHTML`. Currently mitigated by `script-src 'self'` (no `unsafe-inline`), but it is a network-fed HTML sink. | `js/auth/securitySettings.js:53` |
| [ ] | SB-23 | Unencrypted chapter drafts persist in `localStorage` after logout, readable by anyone with access to the device or browser profile. | `js/editor/autosave.js:8` |
| [ ] | SB-24 | The vendored Supabase SDK persists the session in `localStorage` by default. No XSS was found to exploit this, but it removes the last defence layer against token theft. | `js/vendor/supabase.min.js` |
| [ ] | SB-25 | The auto-publisher task runs in-process on a 60-second poll (`main.rs:69-132`). On Render's scale-to-zero or under multiple instances this duplicates work and goes stale while instances are asleep. Not a vulnerability, but a correctness risk adjacent to the moderation and publishing guarantees. | `main.rs:69` |
| [ ] | SB-26 | `ban_user` permits banning an administrator or oneself, has no unban endpoint, and records no audit entry for reversal. | `routes/reports.rs` `ban_user` |
| [ ] | SB-27 | The limiter uses `check_key` (consume), so it is a fixed-window counter, not a sliding throttle; bursts over the limit fail while a steady 100/minute passes. | `middleware.rs:107-116` |
| [x] | SB-28 | ~~CI runs neither `npm run check` nor `cargo build` / `cargo clippy` / `cargo audit` / `npm audit`.~~ **Fixed** — CI now runs lint, format, typecheck, syntax check, frontend build, `npm audit`, `cargo test` and `cargo audit` in three jobs. Clippy runs advisory: the tree carries pre-existing style warnings, so `-D warnings` would fail every run. | `.github/workflows/ci.yml` |
| [x] | SB-29 | ~112 MB of orphaned `temp_raw_*.png` and stray `.webp` files in `backend/`. Gitignored so there is no data leak, but it bloats the deploy image and slows any tooling that walks the directory. | `backend/` |
| [ ] | SB-30 | `.git` is 92 MB for only 136 tracked files, indicating a large binary was committed at some point. `git count-objects -vH` additionally reports a corrupt temp object. | repository |
| [x] | SB-31 | `backend/.env.example:14-16` documents an `ALLOW_MOCK_AUTH` control that does not exist in the code — a mitigation that *appears* present but is entirely inert. | `backend/.env.example` |
| [~] | SB-32 | Dead code: `meilisearch-windows-amd64.exe` (112 MB) sits in the repository root while search runs entirely in Postgres; `js/vendor/qrcode.min.js` is never loaded; `plan.md` and `Plan.md` coexist as divergent duplicates (60 KB and 22 KB). **Partially fixed** — orphaned upload temp files removed; the binary and duplicate plans were left in place as they are not security defects and are yours to delete. | repo root, `js/vendor/`, root |

---

## Verified as sound

Recorded so the next audit does not re-examine these, and so the remediation work does
not disturb them:

- **No SQL injection.** Every query is parameterised. Dynamic paths use
  `sqlx::QueryBuilder::push_bind` (`stories.rs:249-300`). The single `format!` reaching
  SQL text (`stories.rs:288`) interpolates only a `days` integer originating from a
  closed `match` over `"7d" | "30d" | "90d" | "1y"` — not user text.
- **No live XSS.** All 17 modules that use `innerHTML` do so exclusively with static
  string literals; no template-literal interpolation into `innerHTML` exists anywhere in
  the codebase. User-controlled data always reaches the DOM through `textContent` or the
  `components.js` builders. `applyAttrs` forbids `on*` keys in the `button()` path
  (`components.js:311`), though see SB-21 for the sibling function.
- **No dangerous browser sinks.** No `eval`, no `new Function`, no `document.write`, no
  `postMessage` listeners, no `srcdoc`, no `javascript:` URLs. The router is hash-based
  (`js/router.js:2`) and does not construct navigations from untrusted input.
- **CSRF is structurally prevented.** Every mutating route requires an
  `Authorization: Bearer` header, which forces a CORS preflight; and CORS uses an
  explicit origin predicate rather than a wildcard despite `allow_credentials(true)`
  (`main.rs:440-465`).
- **Upload validation is genuine.** Magic-byte validation on PNG / JPEG / WebP / GIF
  (`upload.rs:69-92`) rather than trusting the declared `Content-Type`, with the size
  cap enforced during streaming *before* the buffer is assembled (`upload.rs:133`).
- **Object-level authorization is thorough where implemented.** Reading lists, reading
  progress, bookmarks, internal notes and collaborators all verify ownership
  (`reading_lists.rs`, `progress.rs`, `bookmarks.rs`, `internal_notes.rs`,
  `collaborators.rs:14`).
- **SRI is applied** to the three vendor scripts loaded in `index.html:594-598`.
- **No secrets are hardcoded.** All credentials load from environment variables; the
  `Password123!` values in `tests/` and `scratch/` are disposable test fixtures for
  `testplaywright@example.com`.

---

## Remediation order

1. **SB-01** — one-line gate; closes full unauthenticated compromise.
2. **SB-02, SB-03** — one migration for RLS on five tables plus column-level grants on
   `profiles` and `stories`. Without these, the publicly-served anon key is a skeleton
   key and *any* application-level authorization check can be bypassed at the database
   layer.
3. **SB-04** — remove `admin_email` / `moderator_emails` from `/api/config`.
4. **SB-06, SB-07** — generic error responses, plus the one-character `text` → `content`
   fix.
5. **SB-08, SB-09, SB-10** — cover validation and path containment; comment status
   filter; geo-resolution from a trusted source.
6. **SB-05** — `Option<AuthUser>` → `OptionalAuthUser` across five handlers.
7. **SB-12, SB-13, SB-14, SB-16** — MFA enforcement, tip bounds, health surface,
   NSFW gate on reading lists.
8. **SB-17** — per-user rate limiting, Supabase Auth hardening, mandatory
   `TRUSTED_PROXIES`.
9. **SB-28** — add `npm run check`, `cargo clippy`, `cargo audit` and `npm audit` to CI
   so the next audit is not this long.

---

*Prepared by Space Bunny. Static analysis only — no running instance was available, so
exploitability has not been confirmed end-to-end. SB-01 in particular is worth a single
`curl` against the deployed API to validate before acting on this report.*

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
