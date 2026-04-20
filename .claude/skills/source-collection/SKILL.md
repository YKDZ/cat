---
name: source-collection
description: 使用 CAT 元素收集系统（source-collector、screenshot-collector）从源码中采集可翻译元素和截图上下文，通过 oRPC 端点入库，以及通过 GitHub Action 自动化 CI 收集。当需要扫描项目源码中的 i18n 元素、截图上下文采集、或排查收集流程问题时使用此 skill。
user-invocable: true
---

# CAT 元素收集系统（Source Collection）

元素收集系统将项目源码中的可翻译文本自动采集、入库到 CAT 平台。包含三大组件：

| 组件 | 包名 | 用途 |
|------|------|------|
| 源码收集器 | `@cat/source-collector` | 从 `.vue`/`.ts`/`.js` 等文件中提取 i18n 调用 |
| 截图收集器 | `@cat/screenshot-collector` | 用 Playwright 截图并标注元素在页面中的位置 |
| GitHub Action | `.github/actions/collect` | CI/CD 中自动化收集+入库+截图的复合 Action |

---

## 1. 源码收集器（source-collector）

### 包位置

`packages/source-collector/`

### CLI 用法

```bash
# 基本采集（输出到 stdout）
npx tsx packages/source-collector/src/cli.ts collect \
  --glob "apps/app/src/**/*.vue" \
  --glob "apps/app/src/**/*.ts" \
  --framework vue-i18n \
  --project-id "<项目 UUID>" \
  --source-lang zh_cn \
  --document-name "app-i18n"

# 输出到文件
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

| 参数 | 必填 | 说明 |
|------|------|------|
| `--glob <pattern>` | ✅ | 文件匹配模式（可多次使用） |
| `--framework <id>` | 否 | 提取器框架，默认 `vue-i18n` |
| `--project-id <uuid>` | ✅ | 目标项目 ID |
| `--source-lang <id>` | ✅ | 源语言 ID（如 `zh_cn`、`en`） |
| `--document-name <name>` | ✅ | 文档名称 |
| `--base-dir <path>` | 否 | 基目录，默认当前工作目录 |
| `--output, -o <path>` | 否 | 输出文件路径，默认 stdout |

### 输出格式

输出 `CollectionPayload` JSON，结构定义在 `packages/shared/src/schema/collection.ts`：

```typescript
interface CollectionPayload {
  projectId: string;           // UUID
  sourceLanguageId: string;
  document: { name: string; fileHandlerId?: string };
  elements: Array<{
    ref: string;               // 唯一引用 ID
    text: string;              // 原文文本
    meta: Record<string, unknown>;  // 框架元数据
    sortIndex?: number;
    location?: { startLine?: number; endLine?: number; custom?: Record<string, unknown> };
  }>;
  contexts: Array<{
    elementRef: string;        // 对应 element.ref
    type: "TEXT" | "IMAGE" | "JSON" | "FILE" | "MARKDOWN" | "URL";
    data: { ... };             // 按 type 不同结构
  }>;
}
```

### 编程 API

```typescript
import { collect, vueI18nExtractor } from "@cat/source-collector";

const payload = await collect({
  globs: ["src/**/*.vue", "src/**/*.ts"],
  extractors: [vueI18nExtractor],
  baseDir: "/path/to/project",
  projectId: "00000000-0000-0000-0000-000000000001",
  sourceLanguageId: "zh_cn",
  documentName: "app-i18n",
});
```

### 自举验证

本仓库自身作为测试数据源。运行以下命令可验证收集器是否正常工作：

```bash
npx tsx packages/source-collector/src/cli.ts collect \
  --glob "apps/app/src/**/*.vue" \
  --glob "apps/app/src/**/*.ts" \
  --framework vue-i18n \
  --project-id "00000000-0000-0000-0000-000000000000" \
  --source-lang zh_cn \
  --document-name "app-i18n" \
  | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));console.log('Elements:',d.elements.length,'Contexts:',d.contexts.length)"
```

预期输出约 **792 个元素**（随代码变化可能增减）。若输出 0 或报错，说明提取器或文件匹配有问题。

---

## 2. 截图收集器（screenshot-collector）

### 包位置

`packages/screenshot-collector/`

### 前置条件

- 需要安装 Playwright 浏览器：`npx playwright install chromium`
- 目标应用需要在本地运行（提供 `--base-url`）
- 需要 source-collector 的输出作为输入（`--elements`）

### CLI 用法

```bash
# 仅采集截图（输出 CollectionPayload JSON 到 stdout）
npx tsx packages/screenshot-collector/src/cli.ts collect \
  --base-url http://localhost:3000 \
  --routes routes.json \
  --elements /tmp/source-payload.json \
  --output-dir /tmp/screenshots

# 采集 + 上传到平台 + 关联上下文
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

| 参数 | 必填 | 说明 |
|------|------|------|
| `--base-url <url>` | ✅ | 目标应用 URL（如 `http://localhost:3000`） |
| `--routes <path>` | ✅ | 路由配置 JSON 文件路径 |
| `--elements <path>` | ✅ | source-collector 输出的 JSON 文件路径 |
| `--output-dir <path>` | 否 | 截图输出目录，默认 `./screenshots` |
| `--project-id <uuid>` | `--upload` 时必填 | 目标项目 ID |
| `--document-name <name>` | `--upload` 时必填 | 文档名称 |
| `--api-url <url>` | 否 | 平台 API URL，默认 `http://localhost:3000` |
| `--api-key <key>` | `--upload` 时必填 | API Key（或设置 `CAT_API_KEY` 环境变量） |
| `--upload` | 否 | 上传截图并关联到平台 |
| `--headless / --no-headless` | 否 | 是否无头模式，默认 `true` |

### 路由配置文件格式

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

### 截图流程

1. 启动 Playwright Chromium 浏览器
2. 遍历路由配置，逐页导航（`waitUntil: 'networkidle'`）
3. 对每个唯一 i18n 文本，用 `page.getByText(text, { exact: true }).first()` 定位
4. 用 CSS `outline` 高亮元素，截取页面截图
5. 记录 `boundingBox` 作为 `highlightRegion`
6. 生成 IMAGE 类型的 `CollectionPayload` 上下文

### 编程 API

```typescript
import { collectScreenshots, uploadScreenshots, addImageContexts } from "@cat/screenshot-collector";

// 1. 采集截图
const captured = await collectScreenshots({
  baseUrl: "http://localhost:3000",
  routes: [{ path: "/" }, { path: "/projects" }],
  elements: sourcePayload.elements,
  outputDir: "/tmp/screenshots",
  headless: true,
});

// 2. 上传（可选）
const contexts = await uploadScreenshots(captured, {
  apiUrl: "http://localhost:3000",
  apiKey: "cat_...",
  projectId: "...",
  documentName: "app-i18n",
});

// 3. 关联到平台（可选）
await addImageContexts(contexts, uploadOptions);
```

---

## 3. oRPC 端点

收集系统使用 4 个 oRPC 端点（位于 `apps/app-api/src/orpc/routers/collection.ts`）：

| 端点 | 用途 | 输入 |
|------|------|------|
| `collection.ingest` | 接受 CollectionPayload，执行完整入库流程 | `CollectionPayloadSchema` |
| `collection.prepareUpload` | 获取 presigned 上传 URL + fileId + putSessionId | `{ projectId, fileName }` |
| `collection.finishUpload` | 完成上传：校验、哈希、去重、激活文件 | `{ projectId, putSessionId }` |
| `collection.addContexts` | 为已有元素补充上下文（增量添加） | `{ projectId, documentName, contexts[] }` |

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

# Step 1: 采集源码元素
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
pnpm moon run source-collector:typecheck
pnpm moon run screenshot-collector:typecheck
```

### 运行测试

```bash
pnpm moon run source-collector:test       # 37 个测试
pnpm moon run screenshot-collector:test   # 9 个测试
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

| 症状 | 排查方向 |
|------|----------|
| 元素数为 0 | 检查 `--glob` 模式和 `--base-dir`；确认文件中有 `$t()`/`t()` 调用 |
| 截图全黑/空白 | 检查 `--base-url` 是否正确；确认应用已启动 |
| 上传失败 | 检查 API Key 是否有 `project:editor` 权限；检查 `--api-url` |
| `finishUpload` 报错 | 检查 `putSessionId` 是否正确；Redis session 可能已过期 |
| 相对 URL 上传失败 | 本地存储返回相对 URL，screenshot-collector 已自动处理；若手动调用需拼接 `apiUrl` |
