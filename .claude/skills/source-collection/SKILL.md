---
name: source-collection
description: 使用 CAT 元素收集系统（source-collector、screenshot-collector）从源码中采集可翻译元素和截图上下文，通过 oRPC 端点入库，以及通过 GitHub Action 自动化 CI 收集。当需要扫描项目源码中的 i18n 元素、截图上下文采集、或排查收集流程问题时使用此 skill。
user-invocable: true
---

# CAT 元素收集系统（Source Collection）

元素收集系统将项目源码中的可翻译文本自动采集、入库到 CAT 平台。包含三大组件：

| 组件          | 包名                        | 用途                                         |
| ------------- | --------------------------- | -------------------------------------------- |
| 源码收集器    | `@cat/source-collector`     | 从 `.vue`/`.ts`/`.js` 等文件中提取 i18n 调用 |
| 截图收集器    | `@cat/screenshot-collector` | 用 Playwright 截图并标注元素在页面中的位置   |
| GitHub Action | `.github/actions/collect`   | CI/CD 中自动化收集+入库+截图的复合 Action    |

---

## 1. 源码收集器（source-collector）

### 包位置

`packages/source-collector/`

### CLI 用法

```bash
# 纯粹提取（输出 ExtractionResult JSON）
npx tsx packages/source-collector/src/cli.ts extract \
  --glob "apps/app/src/**/*.vue" \
  --glob "apps/app/src/**/*.ts" \
  --framework vue-i18n \
  --output /tmp/extraction.json

# 兼容采集命令（输出 CollectionPayload JSON，含平台参数）
npx tsx packages/source-collector/src/cli.ts collect \
  --glob "apps/app/src/**/*.vue" \
  --glob "apps/app/src/**/*.ts" \
  --framework vue-i18n \
  --project-id "00000000-0000-0000-0000-000000000001" \
  --source-lang zh_cn \
  --document-name "app-i18n" \
  --output /tmp/source-payload.json
```

### CLI 参数

**`extract` 子命令（纯粹提取）：**

| 参数                  | 必填 | 说明                        |
| --------------------- | ---- | --------------------------- |
| `--glob <pattern>`    | ✅   | 文件匹配模式（可多次使用）  |
| `--framework <id>`    | 否   | 提取器框架，默认 `vue-i18n` |
| `--base-dir <path>`   | 否   | 基目录，默认当前工作目录    |
| `--output, -o <path>` | 否   | 输出文件路径，默认 stdout   |

**`collect` 子命令（兼容命令，输出 CollectionPayload）：**

| 参数                     | 必填 | 说明                          |
| ------------------------ | ---- | ----------------------------- |
| `--glob <pattern>`       | ✅   | 文件匹配模式（可多次使用）    |
| `--framework <id>`       | 否   | 提取器框架，默认 `vue-i18n`   |
| `--project-id <uuid>`    | ✅   | 目标项目 ID                   |
| `--source-lang <id>`     | ✅   | 源语言 ID（如 `zh_cn`、`en`） |
| `--document-name <name>` | ✅   | 文档名称                      |
| `--base-dir <path>`      | 否   | 基目录，默认当前工作目录      |
| `--output, -o <path>`    | 否   | 输出文件路径，默认 stdout     |

### 输出格式

**`extract` 输出** `ExtractionResult` JSON（`packages/shared/src/schema/extraction.ts`）：

```typescript
interface ExtractionResult {
  elements: CollectionElement[];
  contexts: CollectionContext[];
  metadata?: {
    extractorIds: string[];
    baseDir: string;
    timestamp: string;
  };
}
```

**`collect` 输出** `CollectionPayload` JSON（`packages/shared/src/schema/collection.ts`）：

```typescript
interface CollectionPayload {
  projectId: string; // UUID
  sourceLanguageId: string;
  document: { name: string; fileHandlerId?: string };
  elements: CollectionElement[];
  contexts: CollectionContext[];
}
```

### 编程 API

```typescript
import {
  collect,
  extract,
  toCollectionPayload,
  vueI18nExtractor,
} from "@cat/source-collector";

// 纯粹提取（不含平台参数）
const result = await extract({
  globs: ["src/**/*.vue", "src/**/*.ts"],
  extractors: [vueI18nExtractor],
  baseDir: "/path/to/project",
});

// 组装 CollectionPayload（含平台参数）
const payload = toCollectionPayload(result, {
  projectId: "00000000-0000-0000-0000-000000000001",
  sourceLanguageId: "zh_cn",
  documentName: "app-i18n",
});

// 或直接使用 collect()（兼容命令）
const payload2 = await collect({
  globs: ["src/**/*.vue", "src/**/*.ts"],
  extractors: [vueI18nExtractor],
  baseDir: "/path/to/project",
  projectId: "00000000-0000-0000-0000-000000000001",
  sourceLanguageId: "zh_cn",
  documentName: "app-i18n",
});
```

---

## 2. 截图收集器（screenshot-collector）

### 包位置

`packages/screenshot-collector/`

### 前置条件

- 需要安装 Playwright 浏览器：`npx playwright install chromium`
- **必须使用 preview server**（`pnpm moon run app:preview`）而非 dev server，否则 Pinia / Vue DevTools 浮窗会出现在截图中
- 目标应用需要在本地运行（提供 `--base-url`）
- `capture` 子命令需要 ExtractionResult JSON（source-collector extract 输出）
- `collect` 兼容命令需要 CollectionPayload JSON（source-collector collect 输出）

### CLI 用法

```bash
# capture 子命令：ExtractionResult 输入 → CaptureResult 输出
npx tsx packages/screenshot-collector/src/cli.ts capture \
  --base-url http://localhost:3000 \
  --routes tools/seeder/datasets/minecraft/routes.yaml \
  --bindings /tmp/bindings.json \
  --elements /tmp/extraction.json \
  --output-dir /tmp/screenshots \
  --output /tmp/capture-result.json \
  --auth-email user@example.com \
  --auth-password secret

# upload 子命令：CaptureResult → 上传到平台
npx tsx packages/screenshot-collector/src/cli.ts upload \
  --capture /tmp/capture-result.json \
  --project-id "00000000-0000-0000-0000-000000000001" \
  --document-name "app-i18n" \
  --api-url http://localhost:3000 \
  --api-key "cat_..."

# collect 子命令（兼容命令）：CollectionPayload 输入 + 可选上传
npx tsx packages/screenshot-collector/src/cli.ts collect \
  --base-url http://localhost:3000 \
  --routes routes.json \
  --elements /tmp/source-payload.json \
  --output-dir /tmp/screenshots

# collect + 上传到平台
npx tsx packages/screenshot-collector/src/cli.ts collect \
  --base-url http://localhost:3000 \
  --routes routes.json \
  --elements /tmp/source-payload.json \
  --output-dir /tmp/screenshots \
  --project-id "00000000-0000-0000-0000-000000000001" \
  --document-name "app-i18n" \
  --api-url http://localhost:3000 \
  --api-key "cat_..." \
  --upload
```

### CLI 参数

**`capture` 子命令：**

| 参数                          | 必填 | 说明                                            |
| ----------------------------- | ---- | ----------------------------------------------- |
| `--base-url <url>`            | ✅   | 目标应用 URL                                    |
| `--routes <path>`             | ✅   | 路由配置文件路径（JSON 或 YAML）                |
| `--elements <path>`           | ✅   | ExtractionResult JSON 文件路径                  |
| `--bindings <path>`           | 否   | 绑定 JSON 文件路径（覆盖路由文件中的 bindings） |
| `--output-dir <path>`         | 否   | 截图输出目录，默认 `./screenshots`              |
| `--output, -o <path>`         | 否   | CaptureResult JSON 输出路径，默认 stdout        |
| `--headless / --no-headless`  | 否   | 是否无头模式，默认 `true`                       |
| `--auth-email <email>`        | 否   | 登录邮箱（或 `CAT_AUTH_EMAIL` 环境变量）        |
| `--auth-password <password>`  | 否   | 登录密码（或 `CAT_AUTH_PASSWORD` 环境变量）     |
| `--auth-storage-state <path>` | 否   | Playwright storage state 文件路径               |

**`upload` 子命令：**

| 参数                     | 必填 | 说明                                       |
| ------------------------ | ---- | ------------------------------------------ |
| `--capture <path>`       | ✅   | CaptureResult JSON 文件路径                |
| `--project-id <uuid>`    | ✅   | 目标项目 ID                                |
| `--document-name <name>` | ✅   | 文档名称                                   |
| `--api-url <url>`        | 否   | 平台 API URL，默认 `http://localhost:3000` |
| `--api-key <key>`        | ✅   | API Key（或 `CAT_API_KEY` 环境变量）       |

**`collect` 子命令（兼容命令）：**

| 参数                         | 必填              | 说明                                       |
| ---------------------------- | ----------------- | ------------------------------------------ |
| `--base-url <url>`           | ✅                | 目标应用 URL                               |
| `--routes <path>`            | ✅                | 路由配置文件路径                           |
| `--elements <path>`          | ✅                | source-collector 输出的 JSON 文件路径      |
| `--output-dir <path>`        | 否                | 截图输出目录，默认 `./screenshots`         |
| `--project-id <uuid>`        | `--upload` 时必填 | 目标项目 ID                                |
| `--document-name <name>`     | `--upload` 时必填 | 文档名称                                   |
| `--api-url <url>`            | 否                | 平台 API URL，默认 `http://localhost:3000` |
| `--api-key <key>`            | `--upload` 时必填 | API Key（或 `CAT_API_KEY` 环境变量）       |
| `--upload`                   | 否                | 上传截图并关联到平台                       |
| `--headless / --no-headless` | 否                | 是否无头模式，默认 `true`                  |

### 路由配置文件格式

支持两种格式：

**新格式（RouteManifest YAML / JSON）：**

```yaml
# routes.yaml — 支持 $ref:<name> 占位符
routes:
  - template: "/"
    auth: false

  - template: "/project/$ref:project"

  - template: "/editor/$ref:document:elements/zh-Hans/empty"
    waitAfterLoad: 2000
    waitUntil: load # 含 SSE/WebSocket 的页面须用 load，否则 networkidle 会超时

bindings:
  project: "a1b2c3d4-0000-0000-0000-000000000001"
  "document:elements": "42"
```

- `$ref:<name>` 占位符在运行时由 bindings 替换（可来自文件或 `--bindings` 参数）
- `auth: false` 表示该路由无需登录（在独立的无认证浏览器上下文中访问）
- `waitUntil` 默认值为 `networkidle`；编辑器等持有 SSE/WS 连接的页面应设为 `load`
- URL 路径中的语言 ID 须与数据库中的 BCP47 tag 精确一致（如 `zh-Hans`，非 `zh-CN`）

**旧格式（兼容，path 数组）：**

```json
[
  { "path": "/", "waitAfterLoad": 2000 },
  { "path": "/projects" },
  {
    "path": "/login",
    "steps": [
      { "action": "fill", "selector": "#email", "value": "test@test.com" },
      { "action": "fill", "selector": "#password", "value": "password" },
      { "action": "click", "selector": "button[type=submit]" },
      { "action": "wait", "ms": 2000 }
    ]
  }
]
```

`steps` 支持的 action：

- `click` — `{ action: "click", selector: "<CSS选择器>" }`
- `fill` — `{ action: "fill", selector: "<CSS选择器>", value: "<值>" }`
- `wait` — `{ action: "wait", ms: <毫秒数> }`

### 编程 API

```typescript
import {
  captureScreenshots,
  collectScreenshots,
  loadRouteManifest,
  resolveRoutes,
  uploadScreenshots,
  addImageContexts,
} from "@cat/screenshot-collector";

// 新 API：ExtractionResult → CaptureResult
const manifest = await loadRouteManifest("routes.yaml");
const routes = resolveRoutes(manifest, { project: "abc-123" });

const captureResult = await captureScreenshots({
  baseUrl: "http://localhost:3000",
  routes,
  elements: extractionResult.elements,
  outputDir: "/tmp/screenshots",
  headless: true,
  auth: { email: "user@example.com", password: "secret" },
});

// 旧 API：CollectionPayload.elements → CapturedScreenshot[]（兼容）
const captured = await collectScreenshots({
  baseUrl: "http://localhost:3000",
  routes: [{ path: "/" }, { path: "/projects" }],
  elements: sourcePayload.elements,
  outputDir: "/tmp/screenshots",
  headless: true,
});

// 上传（两种 API 均可用）
const contexts = await uploadScreenshots(captured, {
  apiUrl: "http://localhost:3000",
  apiKey: "cat_...",
  projectId: "...",
  documentName: "app-i18n",
});
await addImageContexts(contexts, uploadOptions);
```

### 本地截图工作流（完整端到端）

使用 seeder 的 `--output-bindings` 输出绑定，再结合 extract + capture 完成本地截图：

```bash
# Step 1: 运行 seeder，导出绑定 JSON
cd tools/seeder
tsx main.ts datasets/minecraft --output-bindings /tmp/bindings.json

# Step 2: 提取源码元素
npx tsx packages/source-collector/src/cli.ts extract \
  --glob "apps/app/src/**/*.vue" \
  --glob "apps/app/src/**/*.ts" \
  --framework vue-i18n \
  --output /tmp/extraction.json

# Step 3: 截图（使用 routes.yaml + bindings.json）
# 确保 preview server 已启动（pnpm moon run app:preview），避免 DevTools 出现在截图中
npx playwright install chromium
npx tsx packages/screenshot-collector/src/cli.ts capture \
  --base-url http://localhost:3000 \
  --routes tools/seeder/datasets/minecraft/routes.yaml \
  --bindings /tmp/bindings.json \
  --elements /tmp/extraction.json \
  --output-dir /tmp/screenshots \
  --output /tmp/capture-result.json \
  --auth-email admin@example.com \
  --auth-password secret

# Step 4: 上传截图上下文到平台
npx tsx packages/screenshot-collector/src/cli.ts upload \
  --capture /tmp/capture-result.json \
  --project-id "$PROJECT_ID" \
  --document-name "app-i18n" \
  --api-url http://localhost:3000 \
  --api-key "$CAT_API_KEY"
```

---

## 3. oRPC 端点

收集系统使用 4 个 oRPC 端点（位于 `apps/app-api/src/orpc/routers/collection.ts`）：

| 端点                       | 用途                                            | 输入                                      |
| -------------------------- | ----------------------------------------------- | ----------------------------------------- |
| `collection.ingest`        | 接受 CollectionPayload，执行完整入库流程        | `CollectionPayloadSchema`                 |
| `collection.prepareUpload` | 获取 presigned 上传 URL + fileId + putSessionId | `{ projectId, fileName }`                 |
| `collection.finishUpload`  | 完成上传：校验、哈希、去重、激活文件            | `{ projectId, putSessionId }`             |
| `collection.addContexts`   | 为已有元素补充上下文（增量添加）                | `{ projectId, documentName, contexts[] }` |

### 通过 CLI 调用端点

```bash
# 入库
pnpm cat-cli call collection.ingest --input-file /tmp/source-payload.json

# 准备上传
pnpm cat-cli call collection.prepareUpload '{"projectId":"...","fileName":"screenshot.png"}'

# 完成上传
pnpm cat-cli call collection.finishUpload '{"projectId":"...","putSessionId":"..."}'

# 添加上下文
pnpm cat-cli call collection.addContexts '{"projectId":"...","documentName":"app-i18n","contexts":[...]}'
```

### 上传流程详解

文件上传是三步流程：

```
prepareUpload → PUT 文件 → finishUpload
```

1. **prepareUpload** 返回 `{ url, fileId, putSessionId }`
   - `url` 可能是绝对 URL（S3 presigned）或相对 URL（`/api/storage/upload/:sessionId`，本地存储代理时）
2. **PUT** 将文件内容上传到返回的 URL
   - ⚠️ 若 `url` 以 `/` 开头（相对 URL），需拼接 `apiUrl` 形成绝对 URL
3. **finishUpload** 调用 `finishPresignedPutFile()`：校验 Redis 会话、计算文件哈希、去重、激活文件记录

---

## 4. GitHub Action

### 位置

`.github/actions/collect/action.yml`

### 用途

**仅限本仓库内部使用**（`uses: ./.github/actions/collect`），不支持外部引用。

### Workflow 示例

```yaml
jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/collect
        with:
          project-id: ${{ secrets.CAT_PROJECT_ID }}
          api-url: ${{ secrets.CAT_API_URL }}
          api-key: ${{ secrets.CAT_API_KEY }}
          source-lang: zh_cn
          document-name: app-i18n
          source-glob: |
            apps/app/src/**/*.vue
            apps/app/src/**/*.ts
          # 可选：启用截图
          screenshots: "true"
          screenshot-base-url: "http://localhost:3000"
          screenshot-routes: ".github/screenshot-routes.json"
```

### Action 内部流程

```
source-collector collect → collection.ingest → screenshot-collector collect --upload
```

1. 运行 source-collector CLI，输出 payload 到临时文件
2. 调用 `collection.ingest` 将元素入库
3. （可选）安装 Playwright，运行 screenshot-collector CLI 截图并上传

---

## 5. 完整端到端流程

以下是手动执行完整收集流程的步骤（等同于 GitHub Action 的内部逻辑）：

```bash
# 前置条件：app-api 运行中，有 API Key
export CAT_API_KEY="cat_..."
export CAT_API_URL="http://localhost:3000"

# Step 1: 采集源码元素（兼容命令，含平台参数）
npx tsx packages/source-collector/src/cli.ts collect \
  --glob "apps/app/src/**/*.vue" \
  --glob "apps/app/src/**/*.ts" \
  --framework vue-i18n \
  --project-id "$PROJECT_ID" \
  --source-lang zh_cn \
  --document-name "app-i18n" \
  --output /tmp/source-payload.json

# Step 2: 入库到平台
pnpm cat-cli call collection.ingest --input-file /tmp/source-payload.json

# Step 3（可选）: 截图
npx playwright install chromium

npx tsx packages/screenshot-collector/src/cli.ts collect \
  --base-url http://localhost:3000 \
  --routes .github/screenshot-routes.json \
  --elements /tmp/source-payload.json \
  --output-dir /tmp/screenshots \
  --project-id "$PROJECT_ID" \
  --document-name "app-i18n" \
  --api-url "$CAT_API_URL" \
  --api-key "$CAT_API_KEY" \
  --upload
```

---

## 6. 开发与测试

### 构建与类型检查

```bash
pnpm moon run shared:typecheck
pnpm moon run source-collector:typecheck
pnpm moon run screenshot-collector:typecheck
```

### 运行测试

```bash
pnpm moon run shared:test               # extraction schema + route template tests
pnpm moon run source-collector:test     # 37+ 个测试（含 extract/adapter 新测试）
pnpm moon run screenshot-collector:test # 9+ 个测试（含 route 新测试）
```

### 添加新提取器

1. 在 `packages/source-collector/src/extractors/` 下创建新文件
2. 实现 `SourceExtractor` 接口：

```typescript
import type { SourceExtractor } from "../types.ts";

export const myExtractor: SourceExtractor = {
  id: "my-framework",
  supportedExtensions: [".tsx", ".jsx"],
  extract({ content, filePath }) {
    // 返回 CollectionElement[]
    return [];
  },
};
```

3. 在 `packages/source-collector/src/cli.ts` 的 `FRAMEWORKS` map 中注册
4. 添加对应的单元测试

### 排查常见问题

| 症状                            | 排查方向                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| 元素数为 0                      | 检查 `--glob` 模式和 `--base-dir`；确认文件中有 `$t()`/`t()` 调用                            |
| 截图全黑/空白                   | 检查 `--base-url` 是否正确；确认应用已启动                                                   |
| DevTools 浮窗出现在截图中       | 改用 preview server（`pnpm moon run app:preview`），不要用 dev server                        |
| `page.goto` 超时（networkidle） | 页面含 SSE / WebSocket 长连接；在路由条目中加 `waitUntil: load`                              |
| placeholder 文本未被截图        | collector 已内置 `getByPlaceholder` fallback，无需额外处理；确认 extraction 有该文本         |
| 上传失败                        | 检查 API Key 是否有 `project:editor` 权限；检查 `--api-url`                                  |
| `finishUpload` 报错             | 检查 `putSessionId` 是否正确；Redis session 可能已过期                                       |
| 相对 URL 上传失败               | 本地存储返回相对 URL，screenshot-collector 已自动处理；若手动调用需拼接 `apiUrl`             |
| `$ref` 占位符未替换             | 确认 `--bindings` 文件存在且包含对应 key；检查 seeder 是否用 `--output-bindings`             |
| URL 路径语言 ID 不匹配          | 语言 ID 须与 DB 中 BCP47 tag 完全一致（如 `zh-Hans`），可查询 `ProjectTargetLanguage` 表确认 |
