# Frontend module conventions

Use feature folders for code that belongs to one user-facing area. A feature can
contain its view, controller, state helpers, and API adapter without growing a
single application-wide file. Keep `main.js` responsible for startup and wiring
features together.

## Boundaries

- Views render supplied data and report user intent. They should not own network
  requests or update unrelated application state.
- Controllers coordinate one feature's actions. Pass the specific operations a
  controller needs instead of handing every module the full app context.
- API modules own HTTP details. Views should not build URLs or inspect response
  transport details.
- Shared state stays in `js/state.js`; add focused selectors or actions near
  their feature instead of duplicating state access throughout the app.
- Pass effects such as `notify` and `render` as named functions. Avoid storing a
  broad mutable `ctx` object in a module or placing unrelated services in one.
- Feature modules own their DOM selectors and event wiring. Export a small,
  intentional API for other features.

## Checks

Run `npm run check` before submitting frontend changes. The lint, formatting,
syntax, and type-check targets cover all modular authentication submodules
(`js/auth/*.js` and `js/auth.js`), design/gamification features (`js/achievements.js`),
localization (`js/i18n.js`), and performance tracking (`js/perf.js`). Add new feature
files to the ESLint and Prettier targets and expand `tsconfig.json` as their contracts
become explicit. Keep existing files behavior-focused and avoid reformatting
unrelated code just to satisfy a new check.
