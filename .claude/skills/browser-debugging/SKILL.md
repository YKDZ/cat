---
name: browser-debugging
description: Browser-based debugging and verification for the CAT app. Covers server lifecycle, build chain, login flow, Playwright-based browser tool usage, and common pitfalls. Use when verifying UI fixes via the integrated browser or running E2E-style manual checks.
user-invocable: true
---

# Browser Debugging & Verification

Guide for using the VS Code integrated browser tools to verify UI fixes in the CAT app.

There are two operating modes:

- **Dev mode** (default) — `pnpm dev` with hot reload, fixed credentials, no build step
- **Preview mode** (advanced) — `pnpm build && pnpm preview` mimics production; needed for SSR, bundle, or production-only bugs

---

## Mode 1: Quick Debug (Dev Mode)

### Starting the dev server

```bash
# From apps/app
pnpm moon run app:dev 2>&1 &
```

After backgrounding, wait and confirm:

```bash
sleep 10 && lsof -i :3000 | head -5
```

### Dev credentials

- **Email**: `admin@encmys.cn`
- **Password**: `password`

The password is fixed to `"password"` in dev mode (`NODE_ENV=development`). No need to look up a generated password.

### Hot reload behaviour

In dev mode, Vite watches source files and pushes updates without restarting the server. After editing a `.vue` or `.ts` file in `apps/app`, changes appear within 1–2 seconds — no rebuild or restart needed.

For changes to **library packages** (e.g. `@cat/domain`, `@cat/ui`):

- Rebuild the library: `pnpm moon run domain:build --force`
- Vite picks up the updated `dist/` automatically via HMR — no server restart needed in most cases.

---

## Mode 2: Production Verification (Preview Mode)

Use preview mode when you need to verify SSR, bundle output, or production-specific behaviour.

### Build Chain

```
packages/shared → packages/db → packages/domain → apps/app-api → apps/app
```

```bash
# Full chain rebuild
pnpm moon run domain:build app-api:build app:build --force
```

### Starting the preview server

```bash
pnpm moon run app:preview 2>&1 &
sleep 8 && lsof -i :3000 | head -5
```

### Preview credentials

In preview mode (`NODE_ENV=production`), the admin password is a random hex string generated at first startup. Retrieve it from the database:

```bash
docker ps --format "table {{.ID}}\t{{.Image}}" | grep pgvector
docker exec <container-id> psql -U user -d cat -c \
  "SELECT value FROM \"Setting\" WHERE key = 'system:root_password';"
```

Alternatively, use the seed tool (see below) to populate a known password.

---

## Environment Setup with Seed Tool

To populate the database with known test data and credentials, use the seed tool:

```bash
# From repo root — requires dataset directory
tsx tools/seeder/main.ts datasets/default --skip-vectorization
```

After seeding, `admin@encmys.cn` / `password` will work regardless of mode, provided the dataset defines it in `users.json`.

See `.claude/skills/seeder/SKILL.md` for dataset creation and seed tool usage.

---

## Server Lifecycle

### Stopping the server — CRITICAL SAFETY

**NEVER** use any of these:

```bash
# ALL of these can kill VS Code server → SSH disconnection
lsof -i :3000 -t | xargs kill        # ❌
fuser -k 3000/tcp                     # ❌
pkill -f "node"                       # ❌
killall node                          # ❌
```

**Why**: VS Code's port-forwarding process (`MainThrea`) shares port 3000. `lsof -i :3000` returns the VS Code PID alongside the app server PID. Killing it disconnects the session.

**Safe approach for preview mode** (compiled server):

```bash
# 1. Find ONLY app server PIDs
ps aux | grep "dist/server/index.mjs" | grep -v grep

# 2. Kill specific PIDs
kill <PID1> <PID2> ...

# 3. Verify
ps aux | grep "dist/server/index.mjs" | grep -v grep
```

**Safe approach for dev mode** (Vite dev server):

```bash
# 1. Find Vite server PIDs
ps aux | grep "vike dev\|vite" | grep -v grep

# 2. Kill specific PIDs
kill <PID1> <PID2> ...
```

### Zombie process accumulation

Multiple server invocations can leave orphan processes that bind port 3000. Always check before starting a new server:

```bash
# Check for both dev and preview processes
ps aux | grep -E "dist/server/index.mjs|vike dev" | grep -v grep
# Kill all found PIDs, then start new server
```

---

## Login Flow

The CAT app uses a two-step auth flow:

1. **Email step**: Enter email → click "继续"
2. **Password step**: Enter password → click "验证"
3. Wait for redirect to dashboard

### Browser tool sequence

```
1. open_browser_page  → http://localhost:3000
2. type_in_page       → email in textbox "邮箱"
3. click_element      → button "继续"
4. waitForTimeout(3000)  — wait for password form to appear
5. type_in_page       → password in textbox "密码"
6. click_element      → button "验证"
7. waitForTimeout(3000)  — wait for redirect
8. read_page          → verify dashboard loaded
```

---

## Browser Tool Pitfalls

### 1. Page transitions need explicit waits

After `click_element` on a link/button that triggers navigation or async data loading, the snapshot returned is usually stale. Always add:

```javascript
// via run_playwright_code
await page.waitForTimeout(2000);
```

Then call `read_page` to get the updated DOM.

### 2. `read_page` vs `screenshot_page`

- **`read_page`** returns an accessibility tree (text, refs, structure). Best for finding interactive elements and verifying text content.
- **`screenshot_page`** returns a visual image. Best for layout verification, but you cannot interact with elements from it.
- **`read_page` is generally preferred** — it gives you refs for clicking, typing, etc.

### 3. Stale element refs after page changes

Element refs (`e26`, `e27`, ...) are invalidated after any page navigation or significant DOM update. After waiting for a transition, call `read_page` again to get fresh refs before interacting.

### 4. Combobox / popup interactions

For combobox pickers (like `MultiLanguagePicker`), the pattern is:

```
1. click_element → button "Show popup"
2. waitForTimeout(500)
3. read_page → find the combobox list items
4. type_in_page → filter text in the search input
5. click_element → select an option
```

Some pickers use virtual scrolling — items not in viewport won't appear in the accessibility tree. Use the search/filter input to surface specific items.

### 5. `scrollIntoViewIfNeeded` for off-screen elements

When taking a screenshot of an element below the fold:

```
screenshot_page with scrollIntoViewIfNeeded: true
```

### 6. Console errors in browser output

`run_playwright_code` output includes recent console errors. These are invaluable for debugging 500 errors or frontend exceptions. Always check the "Recent events" section.

---

## Verification Workflow Template

### Dev mode (default)

```
1. Start dev server      (moon run app:dev 2>&1 &)
2. Wait for ready        (sleep 10 && lsof -i :3000)
3. Open browser          (open_browser_page http://localhost:3000)
4. Login                 (admin@encmys.cn / password)
5. Navigate to target    (click links, waitForTimeout between navigations)
6. Verify fix            (read_page → check DOM, screenshot_page → visual)
7. Edit source file      (save → HMR picks up in 1-2s)
8. read_page             (verify updated content)
```

### Preview mode (production verification)

```
1. Rebuild chain         (moon run domain:build app-api:build app:build --force)
2. Kill old server       (ps aux | grep "dist/server/index.mjs" → kill PIDs)
3. Start preview         (moon run app:preview 2>&1 &)
4. Wait for ready        (sleep 8 && lsof -i :3000)
5. Open browser          (open_browser_page)
6. Login                 (look up password from DB or use seeded credentials)
7. Navigate + verify
```

### Round-trip persistence test

When verifying data persistence (e.g. language picker saving to DB):

```
1. Navigate to settings page
2. read_page → verify saved value is displayed
3. Modify value (add/remove)
4. Wait for auto-save or click save
5. Verify DB: docker exec <pg-container> psql -U user -d cat -c "SELECT ..."
6. Reload page (navigate away then back, or page.reload())
7. read_page → verify value still displayed
```

### Database queries via Docker

```bash
# Find postgres container
docker ps --format "table {{.ID}}\t{{.Image}}" | grep pgvector

# Query example
docker exec <container-id> psql -U user -d cat -c "SELECT ... FROM \"TableName\" ...;"
```

Note: Table names are PascalCase and quoted. Column names are snake_case. JSONB fields accessed via `->` (JSON) or `->>` (text).

---

## Terminal Backgrounding Gotcha

When running `pnpm moon run app:preview 2>&1 &`, the terminal may report "waiting for input" — this is a **false positive**. The `&` returns control to the shell prompt, which the terminal monitor interprets as an input prompt. The server is running in the background. Verify with `lsof -i :3000`.

---

## Common Failure Modes

| Symptom                                   | Cause                                      | Fix                                                               |
| ----------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| 500 error on login                        | Server crashed or wasn't started correctly | Use `moon run app:dev` (dev) or `moon run app:preview` (preview)  |
| Port 3000 already in use                  | Zombie server process                      | `ps aux \| grep "dist/server\|vike dev"` → kill PIDs              |
| UI shows stale code (preview)             | Didn't rebuild after code change           | Rebuild full chain: `domain:build app-api:build app:build`        |
| UI shows stale code (dev)                 | Library package not rebuilt                | `pnpm moon run <pkg>:build --force`; HMR picks up automatically   |
| SSH disconnection                         | Killed VS Code port-forwarding process     | See "Stopping the server — CRITICAL SAFETY"                       |
| Login fails with wrong password (preview) | Random password generated at startup       | Look up from DB `Setting` table, or use seed tool                 |
| Login fails with wrong password (dev)     | Not running in dev mode                    | Use `moon run app:dev`, password is always `"password"`           |
| Element ref not found                     | Stale refs from before navigation          | Call `read_page` again after navigation                           |
| Picker shows empty despite DB having data | Async load race / pagination miss          | Check if value is in paginated results; may need "extras" pattern |
