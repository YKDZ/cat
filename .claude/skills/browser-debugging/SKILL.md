---
name: browser-debugging
description: Browser-based debugging and verification for the CAT app. Covers server lifecycle, build chain, login flow, Playwright-based browser tool usage, and common pitfalls. Use when verifying UI fixes via the integrated browser or running E2E-style manual checks.
user-invocable: true
---

# Browser Debugging & Verification

Guide for using the VS Code integrated browser tools to verify UI fixes in the CAT app.

## Build Chain

The monorepo has strict dependency ordering. When modifying a library package, you must rebuild the **entire downstream chain** before the running server will pick up changes.

```
packages/shared → packages/db → packages/domain → apps/app-api → apps/app
```

- Library packages (e.g. `domain`) compile to `dist/` via `vite build`.
- `pnpm` symlinks mean `apps/app` imports from `packages/domain/dist/`.
- The running server loads compiled JS **into memory**. Rebuilding a package does **not** update an already-running server — you must restart it.

### Rebuild commands

```bash
# Rebuild a single package (e.g. after editing domain)
pnpm moon run domain:build --force

# Rebuild downstream chain
pnpm moon run app-api:build app:build --force

# Full chain from domain
pnpm moon run domain:build app-api:build app:build --force
```

`--force` skips moon's cache so the rebuild always runs.

---

## Server Lifecycle

### Starting the server

```bash
# Preferred — moon handles env vars, deps, working dir
pnpm moon run app:preview 2>&1 &

# Alternative — direct node (must cd to app dir first)
cd /workspaces/cat/apps/app && node dist/server/index.mjs &
```

After backgrounding with `&`, wait and confirm:

```bash
sleep 8 && lsof -i :3000 | head -5
```

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

**Safe approach**:

```bash
# 1. Find ONLY app server PIDs
ps aux | grep "dist/server/index.mjs" | grep -v grep

# 2. Kill specific PIDs
kill <PID1> <PID2> ...

# 3. If SIGTERM doesn't work
kill -9 <PID1> <PID2> ...

# 4. Verify
ps aux | grep "dist/server/index.mjs" | grep -v grep
```

### Zombie process accumulation

Multiple `moon run app:preview` invocations can leave orphan `node dist/server/index.mjs` processes. These bind port 3000 and prevent new servers from starting. Always check and clean up before starting a new server:

```bash
ps aux | grep "dist/server/index.mjs" | grep -v grep
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

### Dev credentials

- **Email**: `admin@encmys.cn`
- **Password**: `11f8d6182e86ef2e`

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

For verifying a UI fix end-to-end:

```
1. Rebuild affected packages  (moon run <pkg>:build --force)
2. Kill old server             (ps aux | grep ... → kill PIDs)
3. Start new server            (moon run app:preview 2>&1 &)
4. Wait for ready              (sleep 8 && lsof -i :3000)
5. Open browser                (open_browser_page)
6. Login                       (email → password → verify redirect)
7. Navigate to target page     (click links, wait between navigations)
8. Verify fix                  (read_page to check DOM, screenshot for visual)
9. Test round-trip             (change → save → reload → verify persisted)
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

| Symptom                                   | Cause                                             | Fix                                                               |
| ----------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| 500 error on login                        | Server crashed or wasn't started with correct env | Use `moon run app:preview` instead of direct `node`               |
| Port 3000 already in use                  | Zombie server process                             | `ps aux \| grep "dist/server/index.mjs"` → kill PIDs              |
| UI shows stale code                       | Didn't rebuild after code change                  | Rebuild full chain: `domain:build app-api:build app:build`        |
| SSH disconnection                         | Killed VS Code port-forwarding process            | See "Stopping the server — CRITICAL SAFETY"                       |
| Page shows old content after rebuild      | Server not restarted                              | Kill old server, start new one                                    |
| Element ref not found                     | Stale refs from before navigation                 | Call `read_page` again after navigation                           |
| Picker shows empty despite DB having data | Async load race / pagination miss                 | Check if value is in paginated results; may need "extras" pattern |
