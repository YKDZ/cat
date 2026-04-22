---
subject: ai/agent
---

`@cat/agent` 实现了基于 DAG 的 ReAct（Reasoning + Acting）循环。Agent 的所有中间状态通过 `@cat/graph` 的黑板机制在节点间共享，循环本身由四个固定节点构成。

## ReAct 循环结构

```
PreCheck ──→ Reasoning ──→ Tool（可选）──→ Decision ──┐
   ↑                                                   │ shouldContinue
   └───────────────────────────────────────────────────┘
```

`buildAgentDAG` 将这四个节点拼装为标准 `GraphDefinition`，交由上层运行时（`@cat/workflow`）执行。

### 四个节点的职责

**PreCheck**（`runPreCheckNode`）：每轮最先执行，检查 `current_turn >= maxSteps` 或已超时，满足时设置 `shouldAbort = true`；否则递增轮次计数器，并在黑板写入状态摘要作为后续节点的上下文提示。

**Reasoning**（`runReasoningNode`）：从黑板读取消息历史，通过 `LLMGateway` 调用 LLM；以流的形式消费 `AsyncIterable<LLMChunk>`，`collectLLMResponse` 聚合后将 `text`、`toolCalls`、`thinkingText`、`tokenUsage` 写回黑板。若上下文超限，触发 `CompressionPipeline` 对历史消息进行压缩。

**Tool**（`runToolNode`）：从黑板读取 `tool_calls`，用 `Promise.allSettled` 并发执行所有工具，将结果以 `tool` 角色消息追加到消息历史，并标记 `finish_called`。

**Decision**（`runDecisionNode`）：根据 `finish_called`、工具调用数量、轮次上限及超时状态决定循环是否继续（`shouldContinue`）。

## 黑板数据结构（AgentBlackboardData）

| 字段 | 说明 |
|---|---|
| `messages` | 完整消息历史（system / user / assistant / tool） |
| `tool_calls` | 当前轮次 LLM 生成的工具调用列表 |
| `tool_results` | 工具执行结果 |
| `current_turn` | 已执行轮次（PreCheck 递增） |
| `finish_called` | `finish` 工具是否被调用 |
| `token_usage` | 累计 prompt + completion token 数 |
| `scratchpad` | Agent 工作笔记（由 `update_scratchpad` 工具写入） |

## 关键组件

**LLMGateway**：持有优先级队列和令牌桶，统一管理并发度与速率限制；`LLMPriority` 分为 CRITICAL / HIGH / NORMAL / LOW 四级。

**PromptEngine**：依据 Agent 定义（Markdown + frontmatter）和运行时状态动态构建 `BuiltPrompt`；Slot 系统支持 `static`（始终注入）、`on-demand`（由 LLM 主动拉取）、`disabled` 三种注入模式；`buildPromptVariables` 用于填充 `{{variable}}` 占位符。

**AgentRuntime**：`runLoop(sessionId, runId)` 返回 `AsyncIterable<AgentEvent>`，逐一 emit `started`、`llm_complete`、`tool_call`、`tool_result`、`finished`、`failed` 等事件，供调用层实时推送至前端。

**SessionManager**：负责 `AgentSession` 与 `AgentRun` 的创建（`createSession`）、快照持久化（`saveSnapshot`）和会话标记完成（`completeSession`）。

`parseAgentDefinition` 解析 Agent 定义文件（Markdown + YAML frontmatter），提取工具列表、Prompt 配置等元数据；`registerBuiltinAgents` 在服务启动时将内置 Agent 模板同步至数据库。
