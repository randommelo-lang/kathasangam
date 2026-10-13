# Render staging release checklist

Run these checks against a staging deployment after changing the service names, domains, proxy settings, CSP, upload handling, or authentication. Record the deployment URL, date, and result in the release notes. Do not copy production secrets into test fixtures or CI logs.

## Frontend boundary and routing

- Open the staging home page and confirm the browser receives the frontend assets and the intended security headers.
- Request `/README.md`, `/Plan.md`, `/backend/src/main.rs`, `/tests/smoke.spec.js`, and an unknown route. Each must return 404.
- Confirm `/api/health` and a normal `/api/stories?limit=24` request go to the backend and that an unavailable backend shows a recoverable message in the app.
- Confirm `/uploads/<known-file>` works only for files intentionally published by the upload service.

## Browser policy and origins

- Inspect the actual `Content-Security-Policy` response header. Confirm `script-src` has no `unsafe-inline`, `unsafe-eval`, or broad `https:` source; exercise login, reading, authoring, PDF/DOCX import, and uploaded covers to catch blocked required resources.
- If the app uses a custom domain, add that exact origin to the backend `ALLOWED_ORIGINS` value before this check. Confirm the deployed frontend origin succeeds and an unrelated origin and an unconfigured preview origin fail CORS.
- Confirm the browser's API requests and Supabase session refresh work from the deployed frontend origin.

## Authentication, permissions, and proxy behavior

- Sign in, let the session expire, and confirm a protected action prompts the user to sign in again instead of leaving a stale session in use.
- Check reader, author, moderator, and admin access with accounts assigned to each role. Confirm direct API requests are denied when a role lacks permission, even if the UI link is hidden.
- Verify rate limits group requests by the real client address through the Render proxy. `TRUSTED_PROXIES` must contain only the proxy addresses the service actually receives; if those addresses rotate, document the platform's supported forwarding behavior before changing the trust rule. Confirm a client-supplied forwarding header cannot evade limits.

## Upload and release configuration

- Upload an allowed image and document, then try a file with a mismatched extension/content type, an oversized file, and an unsupported type. Confirm rejected uploads are not stored or served.
- Check the Render environment for required secrets, exact frontend origin, database connection, and production mode. Confirm no secret appears in frontend assets, logs, or error responses.
- Verify health/operations show database and search availability accurately. Search is backed by the existing PostgreSQL service and does not require a separate search server.

## Accessibility and responsive checks

- Complete Discover, Story Details, Reader, Studio, and sign-in flows using only a keyboard. Confirm focus enters dialogs, stays inside them, and returns to the control that opened them.
- Test with a screen reader for control names, loading/errors, selected tabs, and carousel controls. Confirm the carousel can be paused and respects reduced-motion preferences.
- At 200% and 400% zoom, check narrow-screen reflow, visible focus, readable contrast, and no essential controls hidden behind horizontal scrolling.
