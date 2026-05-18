---
name: bootstrap-dataset
description: 使用 CAT 自举数据集从当前 `apps/app` 源码生成真实测试数据，执行 source-first seed、可选截图回填和上下文验证。当 agent 需要为本地调试、上下文回归、邻居元素验证或截图证据测试生成一套“来自 CAT 自身”的真实数据时使用此 skill。
user-invocable: true
---

# CAT 自举数据集（Bootstrap Dataset）

这个 skill 用仓库内置的 `tools/seeder/datasets/bootstrap-app`，把当前 `apps/app` 自身转成一套更真实的测试数据。

它分成三段：

1. **核心 seed**：从 `apps/app` 源码提取 Vue i18n 元素，桥接 locale catalog，把源码/locale 证据写入数据库。
2. **截图增强（可选）**：对 live app 抓取页面截图，并把 `SCREENSHOT` evidence 回填到已有元素上。
3. **抽样验证**：确认上下文查询能同时回出源码、locale、截图、邻居元素等证据。

## 何时使用

在这些场景优先用这个 skill：

- 需要一套比 `e2e` / 静态 JSON seed 更真实的测试数据。
- 需要验证 `source file`、`locale:*`、`screenshot:*`、`local sequence neighbor` 等上下文能否一起回归。
- 需要从当前 CAT 自身源码生成 seed，而不是手写 `elements.json`。
- 需要为召回、上下文组装、截图证据、源码定位等功能准备回归数据。

如果你只需要最小化、静态、确定性的手写种子数据，优先使用 `seeder` skill；如果你只需要单独调试源码扫描或截图采集，也可以搭配 `source-collection` skill 使用。

## 当前系统职责边界

这条链路当前由以下层次组成：

- `@cat/source-collector`：从 `apps/app` 源码提取元素，并在 collector/graph assembly 层把文本按**每个源码文件一个 `ContentNode`** 组织起来。
- `@cat/seed`：读取 `tools/seeder/datasets/bootstrap-app/seed.yaml`，执行 bootstrap profile，把 source graph + locale bridge 注入数据库。
- `@cat/screenshot-collector`：读取 route manifest、bindings 和 extraction result，采集截图并上传证据。
- `apps/app-api/src/orpc/routers/collection.ts`：负责 `prepareUpload` / `finishUpload` / `addScreenshotEvidence`。

**重要**：当前“按源码相对路径拆分 `ContentNode`”的行为来自 `@cat/source-collector` 的组图层，而不是应用层二次重组。

## 关键入口与产物

固定入口：

- 数据集目录：`tools/seeder/datasets/bootstrap-app`
- 配置文件：`tools/seeder/datasets/bootstrap-app/seed.yaml`
- 截图路由：`tools/seeder/datasets/bootstrap-app/routes.yaml`
- 数据集报告：`tools/seeder/datasets/bootstrap-app/artifacts/bootstrap-report.json`

推荐临时产物路径：

- bindings：`/tmp/bootstrap-runtime-bindings.json`
- extraction：`/tmp/bootstrap-extraction.json`
- capture result：`/tmp/bootstrap-capture.json`
- screenshot 目录：`/tmp/bootstrap-screenshots`

## 前置条件

### 核心 seed 必需

- `apps/app/.env` 中的 `DATABASE_URL` / `REDIS_URL` 可用。
- 目标数据库是**可丢弃**的开发/测试库。
- 从仓库根目录执行命令。

### 截图增强额外需要

- 有一个连到**同一数据库**的 live app（`app:dev` 或 `app:preview` 都可以）。
- 能访问应用的 base URL，例如 `http://localhost:3000`。
- 若路由清单包含受保护页面（当前包含 `/settings/security`），需要：
  - `--auth-email` + `--auth-password`，或
  - `--auth-storage-state`
- 有一个可上传文件、且对目标项目具备编辑权限的 runtime API key。

### 改过代码时的附加要求

如果你刚改过这些包，再运行本 skill 前先构建对应产物：

- `packages/seed`
- `packages/source-collector`
- `packages/screenshot-collector`

尤其是 `tools/seeder/main.ts` 通过 `@cat/seed` 包入口消费逻辑时，**改了 `packages/seed` 之后要先重新 build**，否则容易出现“源码改了但 seed 实际没吃到”的幽灵问题。

## 最短路径：先做 source-first seed

这是默认路径；它不依赖浏览器、不依赖 API key，也不依赖截图服务。

```bash
pnpm tsx tools/seeder/main.ts \
  tools/seeder/datasets/bootstrap-app \
  --skip-vectorization \
  --output-bindings /tmp/bootstrap-runtime-bindings.json
```

当前 `bootstrap-app/seed.yaml` 默认也是 `vectorization.enabled: false`。这意味着：

- 对 **source graph / locale bridge / screenshot evidence / context assembly** 回归来说，这已经足够；
- 如果目标是 **向量召回 / 邻近检索 / embedding 驱动功能**，则需要额外启用向量化并保证向量服务可用，再决定是否去掉 `--skip-vectorization`。

### 这一步会做什么

- 清空目标库（受数据库安全保护约束）
- 创建基础项目/语言/用户/插件配置
- 从 `apps/app/src/**/*.{vue,ts}` 提取 `zh-Hans` 源元素
- 用 `apps/app/locales/en_us.json` 生成 `en` locale evidence 与 locale memory material
- 通过结构化 diff 路径把 source graph 注入数据库
- 写出 bindings 和 bootstrap report

### 预期产物

- `tools/seeder/datasets/bootstrap-app/artifacts/bootstrap-report.json`
- `/tmp/bootstrap-runtime-bindings.json`

bindings 至少应包含：

- `project`
- `document:root`
- `content-node:*`
- `element:vue-i18n:*`

### 语言策略

当前 bootstrap profile 的语言策略是固定显式声明的：

- source language：`zh-Hans`
- locale catalog：`apps/app/locales/en_us.json`
- locale catalog 对应 DB 语言：`en`

**不要**把 `zh-CN`、`zh_cn`、文件名别名之类的东西当作隐式等价物，除非 profile 显式映射。

## 可选：启动 live app 做截图增强

如果只需要 source + locale 数据，可以跳过本节。

如果要验证截图证据、受保护页面、或最终 assembled contexts，请启动一个连到同一数据库的 live app。

最简单做法：确保 `apps/app/.env` 已指向刚 seed 的数据库，然后运行：

```bash
pnpm moon run app:dev
```

如果你 seed 到一个临时数据库而不想改 `.env`，可以临时覆盖 `DATABASE_URL` 后再启动 app。

## 生成 ExtractionResult 供截图器使用

截图采集的 `capture` 子命令吃的是 `ExtractionResult`，不是 seeder report。

```bash
pnpm tsx packages/source-collector/src/cli.ts extract \
  --base-dir apps/app \
  --glob "src/**/*.{vue,ts}" \
  --framework vue-i18n \
  --source-lang zh-Hans \
  --output /tmp/bootstrap-extraction.json
```

### 为什么这里单独再跑一次 extract

因为：

- 核心 seed 是“提取并直接入库”；
- 截图器需要一份独立的 extraction JSON 作为页面定位输入；
- bindings 文件会把 `elementRef` 映射回数据库里的真实 `elementId`。

## 可选：采集截图

使用数据集自带的 route manifest：

```bash
pnpm tsx packages/screenshot-collector/src/cli.ts capture \
  --base-url http://localhost:3000 \
  --routes tools/seeder/datasets/bootstrap-app/routes.yaml \
  --bindings /tmp/bootstrap-runtime-bindings.json \
  --elements /tmp/bootstrap-extraction.json \
  --output-dir /tmp/bootstrap-screenshots \
  --output /tmp/bootstrap-capture.json
```

如果需要访问登录态页面，补上认证参数，例如：

```bash
pnpm tsx packages/screenshot-collector/src/cli.ts capture \
  --base-url http://localhost:3000 \
  --routes tools/seeder/datasets/bootstrap-app/routes.yaml \
  --bindings /tmp/bootstrap-runtime-bindings.json \
  --elements /tmp/bootstrap-extraction.json \
  --output-dir /tmp/bootstrap-screenshots \
  --output /tmp/bootstrap-capture.json \
  --auth-email admin@cat.dev \
  --auth-password password
```

### 严格模式（可选）

如果你要把截图覆盖率当作回归门槛，可以加：

- `--strict-min-screenshots <n>`
- `--strict-route <path>`（可重复）

例如：

```bash
pnpm tsx packages/screenshot-collector/src/cli.ts capture \
  --base-url http://localhost:3000 \
  --routes tools/seeder/datasets/bootstrap-app/routes.yaml \
  --bindings /tmp/bootstrap-runtime-bindings.json \
  --elements /tmp/bootstrap-extraction.json \
  --output-dir /tmp/bootstrap-screenshots \
  --output /tmp/bootstrap-capture.json \
  --strict-min-screenshots 1 \
  --strict-route /settings/security
```

## 可选：上传截图证据到平台

`screenshot-collector upload` 会自动走当前正确的三段式上传流程：

1. `collection/prepareUpload`
2. `PUT` 文件
3. `collection/finishUpload`
4. `collection/addScreenshotEvidence`

推荐命令：

```bash
CAT_API_KEY="<runtime-api-key>" \
pnpm tsx packages/screenshot-collector/src/cli.ts upload \
  --capture /tmp/bootstrap-capture.json \
  --bindings /tmp/bootstrap-runtime-bindings.json \
  --project-id "<project-id>" \
  --document-name cat-app-source \
  --api-url http://localhost:3000
```

也可以显式传 `--api-key`。

### 取 `projectId`

`projectId` 来自 bindings 文件里的 `project` 键。不要手猜。

### API key 要求

上传截图证据时，API key 必须对目标项目拥有足够权限。

实践上至少满足其一：

- 具备 `project:*` scope，或
- 对目标 project 有 editor/owner 权限

**空 scope 数组等于没有权限**；这会在 `prepareUpload` / `addScreenshotEvidence` 上直接报 `FORBIDDEN`。

## 抽样验证：确认上下文真的回来了

如果你只 seed 不截图，验证重点是 `source file` / `locale:*` / `neighbor`。

如果你已经上传截图，再验证 `screenshot:*`。

### 建议检查项

任选一个 bindings 里的 `element:*`，调用：

- `element/getContexts`
- `element/getSourceLocation`

`getContexts` 里理想上应看到这些标签中的若干项：

- `element key`
- `source file`
- `locale:<localeId>`
- `screenshot:<route>`
- `local sequence neighbor`

### 典型 live 验证命令

```bash
curl -sS \
  -H "authorization: Bearer $CAT_API_KEY" \
  -H "content-type: application/json" \
  -d '{"json":{"elementId":1234}}' \
  http://localhost:3000/api/rpc/element/getContexts
```

```bash
curl -sS \
  -H "authorization: Bearer $CAT_API_KEY" \
  -H "content-type: application/json" \
  -d '{"json":{"elementId":1234}}' \
  http://localhost:3000/api/rpc/element/getSourceLocation
```

把 `1234` 换成 bindings 中解析出的真实 `elementId`。

## 推荐工作流

### 只需要“真实源码 + locale”测试数据

1. 跑 bootstrap seed
2. 检查 report / bindings
3. 如需 API 层验证，抽样调用 `getContexts`

### 需要“源码 + locale + 截图 + 邻居”完整回归

1. 跑 bootstrap seed
2. 启动 live app（同一数据库）
3. 跑 `source-collector extract`
4. 跑 `screenshot-collector capture`
5. 跑 `screenshot-collector upload`
6. 抽样调用 `element/getContexts` / `getSourceLocation`

## 当前已知坑点

### 1. 改了 `packages/seed` 却忘了 build

症状：你以为 seed 逻辑已经更新，但实际运行结果还是旧行为。

原因：`tools/seeder/main.ts` 通过包入口消费 `@cat/seed`，而不是总是直接读源文件。

处理：改完 `packages/seed` 后先重新构建再 seed。

### 2. API key scope 为空导致上传全被拒绝

症状：`prepareUpload` / `addScreenshotEvidence` 返回 `FORBIDDEN`。

原因：API key 虽然存在，但 `scopes: []` 实际上没有任何项目权限。

处理：使用带 `project:*` 或等效 project editor 权限的 key。

### 3. 误用旧的 collect/addContexts 心智模型

当前 bootstrap 截图回填推荐走：

- `capture`
- `upload`

而不是自己手工拼旧版 `collection.addContexts` 调用。

### 4. 语言 ID 写错

当前 bootstrap source language 是 `zh-Hans`，不是 `zh_cn`、`zh-CN` 或别名。

### 5. screenshot capture 命中受保护页面但没带登录信息

症状：公开页有截图，受保护页（例如 `/settings/security`）没有。

处理：为 `capture` 提供 `--auth-email` / `--auth-password` 或 `--auth-storage-state`。

### 6. 数据库安全保护拦住了 reset

症状：seeder 在 truncate 前拒绝执行。

原因：目标数据库看起来不像 dev/test/local disposable DB。

处理：

- 优先改用真正的测试库名；
- 只有在你确认目标库可销毁时，才使用 `--allow-unsafe-reset`。

## 何时停止

在这些情况下应停止继续“自动重试”：

- 数据库不是可丢弃库，但你又无法确认是否可以重置。
- 截图上传需要新的 secret（密码、API key、storage state）且当前会话里没有安全来源。
- live app 与 seed 数据库不一致，导致截图绑定和上下文查询结果明显错位。

## 完成定义

一次 bootstrap dataset 生成任务，至少应给出这些结果中的若干项：

- seed 命令成功日志
- `bootstrap-report.json`
- bindings 文件
- （可选）capture result JSON
- （可选）截图目录
- （可选）`getContexts` / `getSourceLocation` 抽样结果

如果任务目标包含截图回归，则应额外确认：

- 至少一个元素出现 `screenshot:*` 证据
- 同一元素还能同时返回 `source file` / `locale:*` / `local sequence neighbor`

这说明自举数据集不仅“种进去了”，而且“真的能被上下文系统用起来”。
