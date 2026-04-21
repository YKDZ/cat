---
name: e2e-testing
description: Run and debug Playwright E2E tests for the CAT app. Covers environment setup, running tests, and troubleshooting.
user-invocable: true
---

# E2E Testing Guide

E2E tests verify frontend UI and interaction flows using Playwright against a preview server with seeded test data.

## Prerequisites

- **Docker services running**: PostgreSQL + Redis for E2E
- **Plugins built**: Required for seed pipeline plugin bootstrap
- **Environment configured**: `apps/app-e2e/.env` with E2E database URL
- **Playwright browsers installed**

## Quick Start (from repo root)

```bash
# 1. Start E2E Docker services
docker compose -f apps/app-e2e/docker-compose.yml up -d

# 2. Build plugins (first time or after @cat-plugin/ changes)
pnpm moon run :build

# 3. Configure environment (first time only)
cp apps/app-e2e/.env.example apps/app-e2e/.env

# 4. Install Playwright browsers (first time only)
pnpm exec playwright install chromium firefox

# 5. Run all E2E tests
pnpm moon run app-e2e:test-e2e
```

## Running Tests

```bash
# Full suite (Moon handles app build + preview server automatically)
pnpm moon run app-e2e:test-e2e

# Chromium only (faster local debugging)
pnpm exec playwright test --project=chromium --config=apps/app-e2e/playwright.config.ts

# Single spec file
pnpm exec playwright test tests/auth.spec.ts --config=apps/app-e2e/playwright.config.ts

# UI mode (visual debugging with timeline and DOM snapshots)
pnpm exec playwright test --ui --config=apps/app-e2e/playwright.config.ts
```

## How It Works

1. **globalSetup** (`apps/app-e2e/global-setup.ts`):
   - Validates `DATABASE_URL` contains "e2e" or "test" (safety check)
   - Truncates all tables → seeds database with `datasets/e2e/` dataset
   - Clears Redis vectorization queue keys (`queue:vectorization:pending/processing`) to prevent stale task hang
   - Writes ref→ID mapping to `apps/app-e2e/test-results/e2e-refs.json`

2. **webServer** (`playwright.config.ts`):
   - Runs `pnpm moon run app:preview` (Moon auto-builds app first) **only if the server is not already running**
   - Waits for `/_health` endpoint on port 3000
   - `reuseExistingServer: true` — always reuses an existing server on port 3000; starts via `pnpm moon run app:preview` if nothing is listening
   - **CI note**: moon 2.x skips `persistent: true` tasks in CI environments, so the CI workflow pre-builds the app (`app:build`) and starts `node dist/server/index.mjs` directly before Playwright runs. Playwright then reuses that already-running server.

3. **Fixtures** (`tests/fixtures.ts`):
   - Loads refs from `e2e-refs.json`
   - Authenticates admin user via UI login (worker-scoped, cached)
   - Provides `refs`, `loginPage`, `editorPage`, `projectUrl` to tests

## Environment Variables (`apps/app-e2e/.env`)

```
DATABASE_URL=postgresql://user:pass@localhost:5432/cat_e2e?schema=public
REDIS_URL=redis://localhost:6379
PORT=3000
```

> **IMPORTANT**: Database name MUST contain "e2e" or "test". The globalSetup refuses to run against other databases to prevent accidental data loss.

> **IMPORTANT**: Do NOT use `app:dev` (dev mode) for E2E tests. Dev mode shows Pinia/Vue DevTools floating panels that interfere with Playwright selectors. Always use preview mode.

## Troubleshooting

| Problem                                                     | Solution                                                                                                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| globalSetup: DATABASE_URL validation failed                 | Ensure database name contains "e2e" or "test"                                                                                                                                                       |
| globalSetup: seed failed / PASSWORD auth provider not found | Plugins not built. Run `pnpm moon run :build`                                                                                                                                                       |
| webServer: preview server timeout                           | App build failed or port 3000 in use by a wrong process. Check build logs. For CI failures, check `app.log` printed in the workflow output                                                          |
| Browsers not installed                                      | Run `pnpm exec playwright install chromium firefox`                                                                                                                                                 |
| Docker services not running                                 | Run `docker compose -f apps/app-e2e/docker-compose.yml up -d`                                                                                                                                       |
| Auth fixture: login failed                                  | Auth flow UI may have changed. Check `tests/pages/login-page.ts` selectors                                                                                                                          |
| Server hangs on startup (never reaches `/_health`)          | Stale Redis vectorization tasks — `global-setup.ts` clears them automatically, but for manual server starts run: `redis-cli del queue:vectorization:pending queue:vectorization:processing`         |
| Firefox: auth 500 error / `ENOENT locales/undefined.json`   | Firefox sends `"undefined"` as Accept-Language in headless mode. Fixed in `+onCreateApp.server.ts` (stat try/catch) and `fixtures.ts` (`locale: "zh-Hans"` in context)                              |
| Translation not appearing after submit                      | Check graph node event dispatch: `ctx.addEvent()` is buffered until the **entire node** completes (including QA sub-graphs). Use `await ctx.emit()` when the UI must react before the node finishes |
| Multiple stale server processes on port 3000                | `ps aux                                                                                                                                                                                             | grep dist/server`then`kill -9 <pids>`. Happens when previous test runs left orphaned processes |

## Server Initialization

The app server (`apps/app/src/server/index.ts`) uses a top-level `await initializeApp()` before binding to the port. This means:

- The `/_health` endpoint only responds after DB, Redis, and plugin manager are fully ready
- `onCreateGlobalContext` (Vike hook with hardcoded 30s timeout) is synchronous — it reads from `globalThis.*` via getters set during init
- Cold start on first run can take 10–30s depending on DB migration state

## Redis Vectorization Queue

`registerVectorizationConsumer` drains all pending/processing tasks on startup as crash recovery. If stale tasks exist (especially with high `retryCount` from the `nack()` infinite-retry bug), this hangs indefinitely.

**Known bug**: `nack()` in `RedisTaskQueue` re-queues failed tasks regardless of retry count, causing infinite retry loops. `global-setup.ts` works around this by deleting queue keys before each test run.

## Key Implementation Notes

- **`ctx.emit()` vs `ctx.addEvent()`**: `emit()` publishes immediately to the event bus; `addEvent()` buffers and publishes only after the node handler returns. For SSE-based UI updates that must appear before long-running sub-graphs (e.g., QA) finish, always use `emit()`.
- **PostgreSQL sequences don't reset on TRUNCATE**: DB IDs increment across test runs. Don't hardcode IDs — always use `e2e-refs.json`.
- **`reuseExistingServer`**: Playwright checks `/_health` before launching `webServer`. If the server is unresponsive (e.g., stuck in init), Playwright will launch a second instance — leading to port conflicts.

## Viewing Results

```bash
# HTML report with screenshots and traces
pnpm exec playwright show-report apps/app-e2e/playwright-report
```

## Test Structure

```
apps/app-e2e/
├── global-setup.ts          # DB seed + Redis queue clear + refs output
├── playwright.config.ts     # Config with globalSetup + webServer
├── tests/
│   ├── fixtures.ts          # Playwright fixtures (refs, auth, page objects)
│   ├── pages/
│   │   ├── login-page.ts    # LoginPage Page Object
│   │   └── editor-page.ts   # EditorPage Page Object
│   ├── auth.spec.ts         # Login flow tests
│   └── editor.spec.ts       # Editor interaction tests
└── test-results/
    └── e2e-refs.json        # Runtime: ref→ID mapping from seed
```
