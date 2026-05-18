---
name: e2e-testing
description: 运行和调试 CAT 应用的 Playwright E2E 测试。涵盖环境配置、运行测试和故障排除。
user-invocable: true
---

# E2E 测试指南

E2E 测试使用 Playwright 对带有填充测试数据的预览服务器验证前端 UI 和交互流程。

## 前置条件

- **Docker 服务运行中**：PostgreSQL + Redis 用于 E2E
- **插件已构建**：种子管道插件引导所必需
- **环境已配置**：`apps/app-e2e/.env` 中包含 E2E 数据库 URL
- **Playwright 浏览器已安装**

## 快速开始（从仓库根目录）

```bash
# 1. 启动 E2E Docker 服务
docker compose -f apps/app-e2e/docker-compose.yml up -d

# 2. 构建插件（首次或 @cat-plugin/ 变更后）
pnpm moon run :build

# 3. 配置环境（仅首次）
cp apps/app-e2e/.env.example apps/app-e2e/.env

# 4. 安装 Playwright 浏览器（仅首次）
pnpm exec playwright install chromium firefox

# 5. 运行所有 E2E 测试
pnpm moon run app-e2e:test-e2e
```

## 运行测试

```bash
# 完整套件（Moon 自动处理应用构建 + 预览服务器）
pnpm moon run app-e2e:test-e2e

# 仅 Chromium（本地调试更快）
pnpm exec playwright test --project=chromium --config=apps/app-e2e/playwright.config.ts

# 单个测试文件
pnpm exec playwright test tests/auth.spec.ts --config=apps/app-e2e/playwright.config.ts

# UI 模式（带时间轴和 DOM 快照的可视化调试）
pnpm exec playwright test --ui --config=apps/app-e2e/playwright.config.ts
```

## 工作原理

1. **globalSetup**（`apps/app-e2e/global-setup.ts`）：
   - 验证 `DATABASE_URL` 是否包含 "e2e" 或 "test"（安全检查）
   - 截断所有表 → 用 `datasets/e2e/` 数据集填充数据库
   - 清空 Redis 向量化队列键（`queue:vectorization:pending/processing`）以防止过时任务挂起
   - 将 ref→ID 映射写入 `apps/app-e2e/test-results/e2e-refs.json`

2. **webServer**（`playwright.config.ts`）：
   - 运行 `pnpm moon run app:preview`（Moon 先自动构建应用），**仅当服务器未运行时**
   - 等待 3000 端口上的 `/_health` 端点
   - `reuseExistingServer: true` — 始终复用 3000 端口上已有的服务器；如果没有监听则通过 `pnpm moon run app:preview` 启动
   - **CI 注意**：moon 2.x 在 CI 环境中跳过 `persistent: true` 的任务，因此 CI 工作流会在 Playwright 运行前预先构建应用（`app:build`）并直接启动 `node dist/server/index.mjs`。Playwright 然后复用该已运行的服务器。

3. **Fixtures**（`tests/fixtures.ts`）：
   - 从 `e2e-refs.json` 加载引用
   - 通过 UI 登录验证管理员用户（worker 作用域，已缓存）
   - 向测试提供 `refs`、`loginPage`、`editorPage`、`projectUrl`

## 环境变量（`apps/app-e2e/.env`）

```
DATABASE_URL=postgresql://user:pass@localhost:5432/cat_e2e?schema=public
REDIS_URL=redis://localhost:6379
PORT=3000
```

> **重要**：数据库名称必须包含 "e2e" 或 "test"。globalSetup 拒绝在其他数据库上运行，以防止意外数据丢失。

> **重要**：E2E 测试不要使用 `app:dev`（开发模式）。开发模式会显示 Pinia/Vue DevTools 浮动面板，这会干扰 Playwright 选择器。始终使用预览模式。

## 故障排除

| 问题                                                     | 解决方案                                                                                                                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| globalSetup: DATABASE_URL 验证失败                       | 确保数据库名称包含 "e2e" 或 "test"                                                                                                                                     |
| globalSetup: seed 失败 / 未找到 PASSWORD 认证提供者      | 插件未构建。运行 `pnpm moon run :build`                                                                                                                                |
| webServer: 预览服务器超时                                | 应用构建失败或 3000 端口被错误的进程占用。检查构建日志。CI 失败时，检查工作流输出中打印的 `app.log`                                                                    |
| 浏览器未安装                                             | 运行 `pnpm exec playwright install chromium firefox`                                                                                                                   |
| Docker 服务未运行                                        | 运行 `docker compose -f apps/app-e2e/docker-compose.yml up -d`                                                                                                         |
| Auth fixture: 登录失败                                   | 认证流程 UI 可能已更改。检查 `tests/pages/login-page.ts` 选择器                                                                                                        |
| 服务器启动时挂起（永远无法到达 `/_health`）              | 过时的 Redis 向量化任务——`global-setup.ts` 自动清除它们，但手动启动服务器时运行：`redis-cli del queue:vectorization:pending queue:vectorization:processing`            |
| Firefox: 认证 500 错误 / `ENOENT locales/undefined.json` | Firefox 在无头模式下发送 `"undefined"` 作为 Accept-Language。已在 `+onCreateApp.server.ts`（stat try/catch）和 `fixtures.ts`（context 中的 `locale: "zh-Hans"`）中修复 |
| 提交后翻译未显示                                         | 检查图节点事件分发：`ctx.addEvent()` 在**整个节点**完成后才缓冲（包括 QA 子图）。当 UI 必须在节点完成前响应时，使用 `await ctx.emit()`                                 |
| 3000 端口上有多个过时服务器进程                          | `ps aux \| grep dist/server` 然后 `kill -9 <pids>`。当之前的测试运行留下孤儿进程时会发生                                                                               |

## 服务器初始化

应用服务器（`apps/app/src/server/index.ts`）在绑定到端口之前使用顶级 `await initializeApp()`。这意味着：

- `/_health` 端点只有在 DB、Redis 和插件管理器完全就绪后才响应
- `onCreateGlobalContext`（带有硬编码 30 秒超时的 Vike 钩子）是同步的——它通过初始化期间设置的 getter 从 `globalThis.*` 读取
- 首次运行的冷启动可能需要 10–30 秒，具体取决于 DB 迁移状态

## Redis 向量化队列

`registerVectorizationConsumer` 在启动时清空所有待处理/处理中的任务作为崩溃恢复。如果存在过时任务（尤其是因 `nack()` 无限重试 bug 导致 `retryCount` 很高的任务），这会无限挂起。

**已知 bug**：`RedisTaskQueue` 中的 `nack()` 无论重试次数如何都会重新排队失败的任务，导致无限重试循环。`global-setup.ts` 通过在每次测试运行前删除队列键来绕过此问题。

## 关键实现说明

- **`ctx.emit()` vs `ctx.addEvent()`**：`emit()` 立即发布到事件总线；`addEvent()` 缓冲并仅在节点处理器返回后才发布。对于必须在长时间运行的子图（例如 QA）完成前出现的 SSE 驱动的 UI 更新，始终使用 `emit()`。
- **PostgreSQL 序列在 TRUNCATE 后不重置**：DB ID 在测试运行间递增。不要硬编码 ID——始终使用 `e2e-refs.json`。
- **`reuseExistingServer`**：Playwright 在启动 `webServer` 前检查 `/_health`。如果服务器无响应（例如卡在初始化中），Playwright 会启动第二个实例——导致端口冲突。

## 查看结果

```bash
# 带截图和跟踪的 HTML 报告
pnpm exec playwright show-report apps/app-e2e/playwright-report
```

## 测试结构

```
apps/app-e2e/
├── global-setup.ts          # DB 填充 + Redis 队列清空 + refs 输出
├── playwright.config.ts     # 带 globalSetup + webServer 的配置
├── tests/
│   ├── fixtures.ts          # Playwright fixtures（refs、认证、页面对象）
│   ├── pages/
│   │   ├── login-page.ts    # LoginPage 页面对象
│   │   └── editor-page.ts   # EditorPage 页面对象
│   ├── auth.spec.ts         # 登录流程测试
│   └── editor.spec.ts       # 编辑器交互测试
└── test-results/
    └── e2e-refs.json        # 运行时：seed 的 ref→ID 映射
```
