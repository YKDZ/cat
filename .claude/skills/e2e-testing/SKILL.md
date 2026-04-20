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
   - Writes ref→ID mapping to `apps/app-e2e/test-results/e2e-refs.json`

2. **webServer** (`playwright.config.ts`):
   - Runs `pnpm moon run app:preview` (Moon auto-builds app first)
   - Waits for `/_health` endpoint on port 3000
   - `reuseExistingServer: !process.env.CI` — reuses locally, starts fresh in CI

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

| Problem | Solution |
|---------|----------|
| globalSetup: DATABASE_URL validation failed | Ensure database name contains "e2e" or "test" |
| globalSetup: seed failed / PASSWORD auth provider not found | Plugins not built. Run `pnpm moon run :build` |
| webServer: preview server timeout | App build failed or port 3000 in use. Check build logs |
| Browsers not installed | Run `pnpm exec playwright install chromium firefox` |
| Docker services not running | Run `docker compose -f apps/app-e2e/docker-compose.yml up -d` |
| Auth fixture: login failed | Auth flow UI may have changed. Check `tests/pages/login-page.ts` selectors |

## Viewing Results

```bash
# HTML report with screenshots and traces
pnpm exec playwright show-report apps/app-e2e/playwright-report
```

## Test Structure

```
apps/app-e2e/
├── global-setup.ts          # DB seed + refs output
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
