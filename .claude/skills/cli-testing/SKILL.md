---
name: cli-testing
description: 通过 @cat/cli（pnpm cat-cli）对 CAT 平台的 oRPC 端点、Agent 会话、翻译记忆和术语匹配进行测试与调用。当需要验证后端端点是否正常工作、调试 Agent 行为、或测试翻译业务逻辑时使用此 skill。
user-invocable: true
---

# 通过 CLI 测试与调用 CAT 平台

`@cat/cli`（`pnpm cat-cli`）是 CAT 平台的命令行控制面，通过 oRPC 客户端与 `app-api` 通信。用于验证端点可用性、测试业务逻辑、调试 Agent 行为。

## 前置条件

1. **服务器运行中**：`app-api` 必须在运行（默认 `http://localhost:3000`）。
2. **API Key**：需要有效的 API Key（`cat_...` 格式）。通过环境变量或命令行参数提供：

```bash
# 方式 1: 环境变量（推荐，避免 key 泄漏到命令历史）
export CAT_API_KEY="cat_..."
export CAT_API_URL="http://localhost:3000"   # 可选，默认值即此

# 方式 2: 命令行参数
pnpm cat-cli --api-key "cat_..." --api-url "http://localhost:3000" <command>
```

> **安全提醒**：不要将真实 API Key 硬编码到文件中或打印到聊天输出里。始终使用环境变量。

## 命令概览

| 命令       | 用途                       | 典型场景                    |
| ---------- | -------------------------- | --------------------------- |
| `call`     | 通用调用任意 oRPC handler  | 端点可用性验证、快速调试    |
| `agent`    | Agent 会话管理（流式输出） | 测试 Agent 工作流、工具调用 |
| `memory`   | 翻译记忆查询               | 验证记忆回射、TM 匹配       |
| `glossary` | 术语表查询                 | 验证术语匹配                |
| `routes`   | 列出所有可调用端点路径     | 发现端点、了解 API 表面     |

---

## 1. 通用端点调用（`call`）

`call` 命令可调用任意 oRPC handler，是验证端点是否工作的最直接方式。

### 语法

```bash
pnpm cat-cli call <点分路径> [json-input]
pnpm cat-cli call <点分路径> --input-file <file.json>
```

### 常用测试场景

**验证认证是否正常**（最基础的冒烟测试）：

```bash
pnpm cat-cli call user.me
```

返回当前用户 JSON 表示认证正常；返回 `UNAUTHORIZED` 表示 API Key 无效或 authed 中间件有问题。

**调用带参数的端点**：

```bash
pnpm cat-cli call memory.get '{"memoryId":"550e8400-e29b-41d4-a716-446655440000"}'
```

**从文件读取复杂参数**：

```bash
pnpm cat-cli call glossary.searchTerm --input-file params.json
```

**测试流式端点**（返回 AsyncIterable 的 handler 会逐条打印 JSON）：

```bash
pnpm cat-cli call memory.searchByText '{"projectId":"...","text":"Hello","sourceLanguageId":"en","translationLanguageId":"zh-Hans"}'
```

### 路径发现

**推荐方式**：使用 `routes` 命令查看所有可调用的端点路径（无需服务器连接或 API Key）：

```bash
# 列出所有端点
pnpm cat-cli routes

# 按关键词过滤
pnpm cat-cli routes --filter memory

# 按命名空间分组显示
pnpm cat-cli routes --group

# JSON 格式输出（适合程序化处理）
pnpm cat-cli routes --json
```

路径格式为 `<router>.<handler>`，与 `apps/app-api/src/orpc/routers/` 下的文件和导出名对应，例如：

- `user.get` → `routers/user.ts` 的 `get` 导出
- `memory.searchByText` → `routers/memory.ts` 的 `searchByText` 导出
- `glossary.searchTerm` → `routers/glossary.ts` 的 `searchTerm` 导出
- `auth.createApiKeyEndpoint` → `routers/auth/api-key.ts` 的 `createApiKeyEndpoint` 导出

路径清单由 `apps/cli/src/routes.generated.ts` 提供，通过静态分析 app-api 路由器源文件自动生成。若路由器有变更，运行 `pnpm moon run cli:generate-routes` 重新生成。

---

## 2. Agent 会话测试（`agent`）

用于测试 Agent 工作流、工具调用链、推理过程。`send` 子命令提供流式格式化输出，可直观观察 Agent 行为。

### 子命令

```bash
# 列出现有会话
pnpm cat-cli agent sessions
pnpm cat-cli agent sessions --project-id <uuid>

# 创建新会话
pnpm cat-cli agent create --agent-id <uuid> --project-id <uuid>

# 向会话发送消息（核心测试命令）
pnpm cat-cli agent send --session-id <uuid> -m "翻译元素 42 为中文"
```

### 流式输出事件说明

`agent send` 会流式打印以下事件：

| 事件类型       | 输出格式                | 含义                            |
| -------------- | ----------------------- | ------------------------------- |
| `run:start`    | `▶ Agent 运行开始`      | Agent 开始执行                  |
| `node:start`   | `┌ [nodeType] 开始...`  | 图节点开始处理                  |
| `tool:call`    | `🔧 工具调用: <name>`   | Agent 调用了外部工具            |
| `tool:result`  | `✓ 工具结果: <preview>` | 工具返回结果（截断至 200 字符） |
| `llm:thinking` | 进度点 `.`              | LLM 正在推理                    |
| `llm:complete` | `💬 LLM: <text>`        | LLM 完成回复（含 token 用量）   |
| `node:end`     | `└ [nodeType] 完成`     | 图节点完成                      |
| `run:end`      | `✅ 运行完成`           | Agent 执行完毕                  |
| `run:error`    | `❌ 错误: <msg>`        | 执行出错                        |

### Agent 测试工作流

典型的 Agent 端到端测试流程：

```bash
# 1. 创建会话
pnpm cat-cli agent create --agent-id <agent-def-uuid> --project-id <project-uuid>
# → 记录返回的 sessionId

# 2. 发送测试消息，观察工具调用和推理
pnpm cat-cli agent send --session-id <session-uuid> -m "请翻译元素 42"

# 3. 追加上下文验证多轮对话
pnpm cat-cli agent send --session-id <session-uuid> -m "修改术语'国际化'的翻译"
```

### 使用 `--extra-json` 注入额外参数

所有便捷命令支持 `--extra-json` 将额外字段合并到请求中：

```bash
pnpm cat-cli agent send --session-id <uuid> -m "test" --extra-json '{"stream":false}'
```

---

## 3. 翻译记忆测试（`memory`）

验证翻译记忆的回射（recall）功能。支持按元素和按文本两种查询维度。

### 按元素查询

```bash
pnpm cat-cli memory element --element-id 42 --lang zh-Hans
```

测试指定翻译元素是否能召回相关翻译记忆。`--min-confidence` 可调整阈值（默认 0.72）。

### 按文本查询

```bash
pnpm cat-cli memory text \
  --project-id <uuid> \
  --text "Hello world" \
  --source-lang en \
  --target-lang zh-Hans \
  --min-confidence 0.5
```

测试基于原始文本的记忆检索。适用于验证向量检索、TM 匹配质量。

### 记忆测试检查清单

- 空项目应返回空结果（无错误）
- 已有精确匹配的文本应返回高置信度结果
- 调低 `--min-confidence` 应返回更多模糊匹配
- 不同语言对应返回对应语言的翻译

---

## 4. 术语匹配测试（`glossary`）

验证术语表的识别和匹配功能。

### 按元素查找

```bash
pnpm cat-cli glossary element --element-id 42 --lang zh-Hans
```

### 按文本搜索

```bash
pnpm cat-cli glossary text \
  --project-id <uuid> \
  --text "internationalization" \
  --source-lang en \
  --target-lang zh-Hans
```

默认最低置信度为 0.6（低于记忆的 0.72），可通过 `--min-confidence` 调整。

---

## 5. 错误诊断

CLI 使用结构化错误输出，格式为 `[ERROR] CODE: message + hint`。常见错误：

| 错误码             | 含义                      | 排查方向                                                                      |
| ------------------ | ------------------------- | ----------------------------------------------------------------------------- |
| `MISSING_API_KEY`  | 未提供 API Key            | 检查 `$CAT_API_KEY` 或 `--api-key`                                            |
| `RPC_ERROR`        | oRPC 服务端错误           | 查看 status 和 message 字段，常见：`UNAUTHORIZED`、`NOT_FOUND`、`BAD_REQUEST` |
| `VALIDATION_ERROR` | 输入参数不符合 Zod schema | 检查 issues 字段中的 path 和 expected 信息                                    |
| `NETWORK_ERROR`    | 无法连接服务器            | 确认 `$CAT_API_URL` 和服务器状态                                              |
| `UNKNOWN_COMMAND`  | 命令或子命令不存在        | 运行 `--help` 查看可用命令                                                    |

当遇到 `VALIDATION_ERROR` 时，错误输出会包含 Zod issue 列表，指明哪些字段不符合预期。根据 `path`（字段路径）和 `expected`（期望类型）进行修正。

---

## 6. 测试策略指南

### 冒烟测试（快速验证服务是否存活）

```bash
pnpm cat-cli call user.me
```

### 端点可用性验证

对某个新增或修改的端点，使用 `call` 直接调用确认不报错：

```bash
pnpm cat-cli call <router>.<handler> '{ ... }'
```

### 业务逻辑回归测试

对翻译核心逻辑，组合使用 memory 和 glossary 命令：

```bash
# 记忆回射是否正常
pnpm cat-cli memory text --project-id <uuid> --text "..." --source-lang en --target-lang zh-Hans

# 术语匹配是否正常
pnpm cat-cli glossary text --project-id <uuid> --text "..." --source-lang en --target-lang zh-Hans
```

### Agent 工作流验证

创建会话 → 发送消息 → 观察工具调用链是否符合预期：

```bash
pnpm cat-cli agent create --agent-id <uuid> --project-id <uuid>
pnpm cat-cli agent send --session-id <返回的-uuid> -m "测试指令"
```

观察输出中的 `🔧 工具调用` 和 `✓ 工具结果` 确认 Agent 调用了正确的工具。

---

## 注意事项

- **所有流式端点**（memory、glossary 查询和 agent send）返回的是 AsyncIterable，CLI 会逐条打印 JSON 对象。
- **`call` 命令不做任何格式化**，原样输出服务端返回的 JSON，适合管道处理（`| jq`）。
- **便捷命令只覆盖常用参数**，不常见的参数通过 `--extra-json` 注入，或直接用 `call` 命令。
- **`routes` 命令是离线的**：无需服务器运行或 API Key，始终可用。用于在调用前发现可用端点。
- **路径清单是编译时生成的**：由 `apps/cli/scripts/generate-routes.ts` 静态分析路由器源文件生成。新增端点后需运行 `pnpm moon run cli:generate-routes` 更新。`call` 命令本身通过 oRPC 代理支持动态路径，不受此限制。
