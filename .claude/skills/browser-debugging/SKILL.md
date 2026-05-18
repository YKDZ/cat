---
name: browser-debugging
description: 针对 CAT 应用的浏览器调试与验证。涵盖服务器生命周期、构建链、登录流程、基于 Playwright 的浏览器工具用法及常见陷阱。在通过集成浏览器验证 UI 修复或运行 E2E 风格手动检查时使用。
user-invocable: true
---

# 浏览器调试与验证

使用 VS Code 集成浏览器工具验证 CAT 应用 UI 修复的指南。

有两种操作模式：

- **开发模式**（默认）— `pnpm dev` 带热重载、固定凭据、无需构建步骤
- **预览模式**（高级）— `pnpm build && pnpm preview` 模拟生产环境；用于 SSR、bundle 或仅生产环境出现的 bug

---

## 模式一：快速调试（开发模式）

### 启动开发服务器

```bash
# 从 apps/app 目录执行
pnpm moon run app:dev 2>&1 &
```

后台化后，等待并确认：

```bash
sleep 10 && lsof -i :3000 | head -5
```

### 开发模式凭据

- **邮箱**: `admin@encmys.cn`
- **密码**: `password`

在开发模式下（`NODE_ENV=development`），密码固定为 `"password"`。无需查找生成的密码。

### 热重载行为

在开发模式下，Vite 监听源文件并在不重启服务器的情况下推送更新。编辑 `apps/app` 中的 `.vue` 或 `.ts` 文件后，变更会在 1–2 秒内生效——无需重新构建或重启。

对于**库包**的变更（例如 `@cat/domain`、`@cat/ui`）：

- 重新构建库：`pnpm moon run domain:build --force`
- Vite 通过 HMR 自动获取更新后的 `dist/`——大多数情况下无需重启服务器。

---

## 模式二：生产验证（预览模式）

当需要验证 SSR、bundle 输出或仅在生产环境出现的行为时使用预览模式。

### 构建链

```
packages/shared → packages/db → packages/domain → apps/app-api → apps/app
```

```bash
# 完整链重建
pnpm moon run domain:build app-api:build app:build --force
```

### 启动预览服务器

```bash
pnpm moon run app:preview 2>&1 &
sleep 8 && lsof -i :3000 | head -5
```

### 预览模式凭据

在预览模式下（`NODE_ENV=production`），管理员密码是首次启动时生成的随机十六进制字符串。从数据库中获取：

```bash
docker ps --format "table {{.ID}}\t{{.Image}}" | grep pgvector
docker exec <container-id> psql -U user -d cat -c \
  "SELECT value FROM \"Setting\" WHERE key = 'system:root_password';"
```

或者，使用 seed 工具（见下文）填充已知密码。

---

## 使用 Seed 工具配置环境

要用已知的测试数据和凭据填充数据库，使用 seed 工具：

```bash
# 从仓库根目录执行——需要数据集目录
tsx tools/seeder/main.ts datasets/default --skip-vectorization
```

填充后，`admin@encmys.cn` / `password` 将在任何模式下生效，前提是数据集在 `users.json` 中定义了该用户。

参见 `.claude/skills/seeder/SKILL.md` 了解数据集创建和 seed 工具用法。

---

## 服务器生命周期

### 停止服务器——关键安全提示

**绝对不要**使用以下任何命令：

```bash
# 这些命令都可能杀死 VS Code 服务器 → SSH 断开连接
lsof -i :3000 -t | xargs kill        # ❌
fuser -k 3000/tcp                     # ❌
pkill -f "node"                       # ❌
killall node                          # ❌
```

**原因**：VS Code 的端口转发进程（`MainThrea`）共享 3000 端口。`lsof -i :3000` 会同时返回 VS Code PID 和应用服务器 PID。杀掉它会断开会话。

**预览模式的安全方法**（已编译的服务器）：

```bash
# 1. 只查找应用服务器 PID
ps aux | grep "dist/server/index.mjs" | grep -v grep

# 2. 杀死特定 PID
kill <PID1> <PID2> ...

# 3. 验证
ps aux | grep "dist/server/index.mjs" | grep -v grep
```

**开发模式的安全方法**（Vite 开发服务器）：

```bash
# 1. 查找 Vite 服务器 PID
ps aux | grep "vike dev\|vite" | grep -v grep

# 2. 杀死特定 PID
kill <PID1> <PID2> ...
```

### 僵尸进程堆积

多次服务器调用可能会留下占用 3000 端口的孤儿进程。启动新服务器前始终检查：

```bash
# 检查开发和预览进程
ps aux | grep -E "dist/server/index.mjs|vike dev" | grep -v grep
# 杀死所有找到的 PID，然后启动新服务器
```

---

## 登录流程

CAT 应用使用两步认证流程：

1. **邮箱步骤**：输入邮箱 → 点击"继续"
2. **密码步骤**：输入密码 → 点击"验证"
3. 等待重定向到仪表板

### 浏览器工具操作序列

```
1. open_browser_page  → http://localhost:3000
2. type_in_page       → 在"邮箱"文本框中输入邮箱
3. click_element      → 点击"继续"按钮
4. waitForTimeout(3000)  — 等待密码表单出现
5. type_in_page       → 在"密码"文本框中输入密码
6. click_element      → 点击"验证"按钮
7. waitForTimeout(3000)  — 等待重定向
8. read_page          → 验证仪表板已加载
```

---

## 浏览器工具常见陷阱

### 1. 页面跳转需要显式等待

在触发导航或异步数据加载的链接/按钮上执行 `click_element` 后，返回的快照通常是过时的。始终添加：

```javascript
// 通过 run_playwright_code
await page.waitForTimeout(2000);
```

然后调用 `read_page` 获取更新后的 DOM。

### 2. `read_page` vs `screenshot_page`

- **`read_page`** 返回无障碍树（文本、引用、结构）。最适合查找交互元素和验证文本内容。
- **`screenshot_page`** 返回视觉图像。最适合布局验证，但无法从中与元素交互。
- **通常优先使用 `read_page`** — 它提供用于点击、输入等操作的引用。

### 3. 页面变化后元素引用过期

元素引用（`e26`、`e27` 等）在任何页面导航或重大 DOM 更新后都会失效。等待页面跳转后，重新调用 `read_page` 获取新引用再进行交互。

### 4. 下拉框 / 弹出层交互

对于下拉选择器（如 `MultiLanguagePicker`），操作模式为：

```
1. click_element → 点击"显示弹出层"按钮
2. waitForTimeout(500)
3. read_page → 查找下拉列表项
4. type_in_page → 在搜索输入框中输入过滤文本
5. click_element → 选择一个选项
```

某些选择器使用虚拟滚动——不在视口内的项目不会出现在无障碍树中。使用搜索/过滤输入框来显示特定项目。

### 5. 屏幕外元素使用 `scrollIntoViewIfNeeded`

对折叠下方的元素截图时：

```
screenshot_page with scrollIntoViewIfNeeded: true
```

### 6. 浏览器输出中的控制台错误

`run_playwright_code` 的输出包含最近的控制台错误。这对于调试 500 错误或前端异常非常宝贵。始终检查"Recent events"部分。

---

## 验证工作流模板

### 开发模式（默认）

```
1. 启动开发服务器      (moon run app:dev 2>&1 &)
2. 等待就绪            (sleep 10 && lsof -i :3000)
3. 打开浏览器          (open_browser_page http://localhost:3000)
4. 登录                (admin@encmys.cn / password)
5. 导航到目标页面      (点击链接，导航间添加 waitForTimeout)
6. 验证修复            (read_page → 检查 DOM，screenshot_page → 视觉)
7. 编辑源文件          (保存 → HMR 在 1-2 秒内生效)
8. read_page            (验证更新后的内容)
```

### 预览模式（生产验证）

```
1. 重建链              (moon run domain:build app-api:build app:build --force)
2. 杀死旧服务器        (ps aux | grep "dist/server/index.mjs" → kill PIDs)
3. 启动预览            (moon run app:preview 2>&1 &)
4. 等待就绪            (sleep 8 && lsof -i :3000)
5. 打开浏览器          (open_browser_page)
6. 登录                (从 DB 查询密码或使用已填充的凭据)
7. 导航 + 验证
```

### 数据持久化往返测试

验证数据持久化时（例如语言选择器保存到数据库）：

```
1. 导航到设置页面
2. read_page → 验证已保存的值已显示
3. 修改值（添加/删除）
4. 等待自动保存或点击保存
5. 验证 DB：docker exec <pg-container> psql -U user -d cat -c "SELECT ..."
6. 重新加载页面（导航离开后再返回，或 page.reload()）
7. read_page → 验证值仍然显示
```

### 通过 Docker 查询数据库

```bash
# 查找 postgres 容器
docker ps --format "table {{.ID}}\t{{.Image}}" | grep pgvector

# 查询示例
docker exec <container-id> psql -U user -d cat -c "SELECT ... FROM \"TableName\" ...;"
```

注意：表名为 PascalCase 并需要引号。列名为 snake_case。JSONB 字段通过 `->` (JSON) 或 `->>` (文本) 访问。

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
