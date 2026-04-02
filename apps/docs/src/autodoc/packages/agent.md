# @cat/agent

Agent and Workflow graph executor

## Overview

- **Modules**: 121
- **Exported functions**: 56
- **Exported types**: 99

## Function Index

### src

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `getBuiltinAgentTemplate` | templateId | `BuiltinAgentTemplate | undefined` | Look up a builtin template by its stable `templateId`. |

### src/workflow

*No exported functions*

### src/utils

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `generateToolDescriptions` | tools | `string` | Generate a formatted listing of available tools for injection into
the agent system prompt. Each tool is rendered as a bullet with its
name and description.

Client-side tools are annotated with `[editor]` so the LLM knows they
operate in the user's browser editor. |
| `injectToolDescriptions` | systemPrompt, tools | `string` | Inject auto-generated tool descriptions into a system prompt.

Only activates when the prompt explicitly contains the
`{{toolDescriptions}}` placeholder — replaces all occurrences with
the generated text. If the placeholder is absent the prompt is
returned unchanged, since LLM providers already receive full tool
definitions via the structured `tools` parameter.

Call this **after** resolving user-supplied variables so that
`{{toolDescriptions}}` is treated as a reserved built-in variable. |
| `generateContextVariableDescriptions` | variables | `string` | Generate a formatted "Available context:" block from `systemPromptVariables`
definitions. Each variable is rendered as a bullet using its `name` (falling
back to the key) followed by the `{{key}}` interpolation token so that the
real values are substituted in the subsequent variable-resolution pass.

Example output:
```
Available context:
- Source language: {{sourceLanguageId}}
- Translation language: {{translationLanguageId}}
``` |
| `injectContextVariables` | systemPrompt, variables | `string` | Inject an auto-generated context variables block into a system prompt.

Only activates when the prompt contains the `{{contextVariables}}`
placeholder. The generated block still contains `{{key}}` tokens, so this
function **must be called before** user-supplied variable substitution so
that those tokens are resolved in the next pass. |

### src/tools

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `defineTool` | def | `AgentToolDefinition` | Factory that infers the schema output type for `execute`, so args are
fully typed without manually calling `parameters.parse()` inside each tool.

The agent framework calls `parameters.parse()` automatically before invoking
`execute`, so individual tools never need to validate args themselves. |
| `defineClientTool` | def | `AgentToolDefinition` | Define a client-side tool declaration that has no server `execute` implementation.
The backend registers this so the LLM knows the tool exists, but actual
execution is delegated to the frontend via the streaming protocol. |
| `createToolRegistry` | - | `ToolRegistry` | Create a new ToolRegistry instance |

### src/runtime

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `createRuntimeResolver` | options | `RuntimeResolver` | - |
| `parseRuntimeRefFromMetadata` | metadata | `{ sessionId: number; agentDefinitionId: number; userId: string; toolNames: string[]; toolSnapshot: { name: string; description: string; parameters: any; }[]; promptStrategy: "persisted" | "rebuild"; llmProviderDbId?: number | null | undefined; persistedSystemPrompt?: string | undefined; } | null` | - |
| `withRuntimeRefMetadata` | params | `Record<string, unknown> | null` | - |

### src/llm

*No exported functions*

### src/session

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `setupToolRegistry` | params | `AgentToolDefinition[]` | - |
| `mapSessionMetaToSeeds` | metadata | `Record<string, string | number | boolean>` | - |
| `resolveSession` | drizzle, sessionExternalId, userId? | `Promise<ResolvedSession>` | Load and validate an agent session from the DB. |
| `resolveDefinition` | drizzle, agentDefinitionId | `Promise<{ id: string; name: string; description: string; version: string; type: "GENERAL" | "GHOST_TEXT" | "WORKFLOW"; systemPrompt: string; tools: string[]; icon?: string | undefined; llm?: { providerId: number; temperature?: number | undefined; maxTokens?: number | undefined; } | undefined; systemPromptVariables?: Record<string, { type: "string" | "number" | "boolean"; source: "input" | "context" | "config"; name?: string | undefined; description?: string | undefined; }> | undefined; constraints?: { maxSteps: number; maxConcurrentToolCalls: number; timeoutMs: number; maxCorrectionAttempts: number; } | undefined; orchestration?: { mode: "pipeline"; stages: { agentId: string; outputKey: string; inputFrom?: string | string[] | undefined; }[]; } | null | undefined; }>` | Load and parse the agent definition for the given DB-internal definition ID. |
| `buildSystemPrompt` | params | `Promise<string>` | Build the fully-interpolated system prompt for an agent run.

Pipeline:
1. Expand seed variables (userId + session metadata fields)
2. Assemble builtin providers + plugin-supplied context providers
3. Run the topological context resolution engine
4. Replace all {{key}} placeholders in the system prompt

All context variables are derived from **server-side** sources to prevent
prompt-injection via forged client values. Plugin context providers
registered via the AGENT_CONTEXT_PROVIDER service can augment the
variable set at runtime. |
| `rebuildConversationFromRuns` | drizzle, sessionInternalId, systemPrompt | `Promise<ChatMessage[]>` | Rebuild the conversation history (ChatMessage[]) for a session by reading
the Blackboard snapshot from the last completed AgentRun.

Strategy: Blackboard Snapshot method
- Each completed Graph Run leaves a `messages` array in its Blackboard snapshot.
- We read only the most recent completed run's snapshot to get the full history.
- Falls back to a system-prompt-only array if no completed runs exist yet. |

### src/db

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `withAgentDb` | handler | `Promise<TResult>` | app-agent 自己保留这层薄适配，主要是为了：
1. 让 workflow / tools 不再直接接触 getDrizzleDB()
2. 统一默认 command collector 策略（当前为 noopCollector）
3. 在需要组合多个 c/q 或显式事务时，仍保留最小的入口层编排能力

它不是新的业务层，只是 agent 运行时的 DB / domain 边界适配器。 |
| `withAgentDbTransaction` | handler | `Promise<TResult>` | - |
| `runAgentQuery` | query, input | `Promise<R>` | - |
| `runAgentCommand` | command, input | `Promise<R>` | - |

### src/graph

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `storeGraphRuntime` | runtime | `void` | - |
| `getStoredGraphRuntime` | - | `StoredGraphRuntime` | - |
| `createDefaultGraphRuntime` | drizzle, pluginManager | `DefaultGraphRuntime` | - |
| `createAgentEvent` | eventLike | `AgentEvent` | - |
| `normalizeEventEnvelope` | runId, nodeId, eventLike | `AgentEventLike` | - |
| `generateCacheKey` | payload | `string` | - |
| `resolveCacheKey` | namespace, payload, options? | `string | null` | - |
| `createPatchMetadata` | args | `PatchMetadata` | - |
| `buildPatch` | args | `Patch` | - |

### src/context

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `topoSortProviders` | providers | `number[][]` | 对 provider 列表执行拓扑排序，返回分层结果。

算法：Kahn's Algorithm
1. 构建 variableKey → providerIndex 的"谁提供了什么"映射
2. 构建 providerIndex → Set<providerIndex> 的邻接表（依赖关系）
3. 入度为 0 的 provider 先执行
4. 若最终排序结果数量 < provider 数量，说明存在环路 |
| `resolveContextVariables` | options | `Promise<Map<string, string | number | boolean>>` | 变量解析引擎。

执行流程：
1. 将 seeds 写入初始 Map
2. 收集所有 provider 的 provides/dependencies 声明
3. 调用 topoSortProviders 得到执行顺序（同时完成环路检测）
4. 按拓扑层顺序执行 provider.resolve()（同层 Promise.all 并行）
   - 跳过必需依赖缺失的 provider（警告日志）
   - 可选依赖缺失时正常调用
   - 权限拒绝时跳过（警告日志）
   - 将 resolve 返回的变量合并入 Map（键冲突时后者覆盖）
5. 返回最终完整的 Map<string, string | number | boolean> |
| `createBuiltinProviders` | params | `[BuiltinGlossaryProvider, BuiltinContextDescriptionProvider, BuiltinToolDescriptionProvider]` | 创建内置 provider 实例数组。

注意：`BuiltinGlossaryProvider` 需要直接访问 DB，
因此独立于 ContextResolveContext 直接注入 drizzle 客户端。
（这与 resolver 传递给 resolve() 的 drizzle 是同一个实例。） |

### src/workflow/tasks

*No exported functions*

### src/tools/builtin

*No exported functions*

### src/graph/typed-dsl

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `registerStepHandler` | name, handler | `void` | - |
| `getStepHandler` | name | `StepHandler<unknown, unknown> | undefined` | - |
| `hasStepHandler` | name | `boolean` | - |
| `runGraph` | graph, input, options? | `Promise<z.core.output<TOutput>>` | Starts a typed graph as a new run and awaits completion.

Uses the global runtime (scheduler, eventBus, checkpointer) initialised by
`createDefaultGraphRuntime`. The `pluginManager` is sourced from the global
runtime unless overridden via `options.pluginManager`. |
| `startGraph` | graph, input, options? | `Promise<GraphRunHandle<z.core.output<TOutput>>>` | Starts a typed graph run and returns a handle containing the `runId`
and a `complete` promise.  Useful when the caller needs the `runId`
upfront (e.g. to filter graph-emitted events before the run finishes). |
| `defineTypedGraph` | options | `TypedGraphDefinition<TInput, TOutput>` | 声明一个类型安全的 DAG 工作流。

- 编译阶段：泛型推断保证节点 input/output schema 匹配
- 运行时：输出标准 GraphDefinition + 注册 step handler
- 执行时：增强的 TransformNodeExecutor 通过 config.handler 分发 |
| `defineNode` | def | `TypedNodeDef<TInput, TOutput>` | 辅助函数：显式声明一个类型安全节点，允许 TypeScript 正确推断 handler 参数类型。

用法：`defineNode({ input: schema, output: schema, handler: async (input) => {...} })` |

### src/graph/graphs

*No exported functions*

### src/graph/executors

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `resolvePath` | data, path | `unknown` | - |
| `interpolateTemplate` | template, data | `string` | - |
| `hashArgs` | args | `string` | - |
| `ToolNodeExecutor` | ctx, config | `Promise<{ status: string; pauseReason: string; output: { toolName: any; }; patch?: undefined; } | { patch: any; output: any; status: string; pauseReason?: undefined; }>` | - |
| `SubgraphNodeExecutor` | ctx, config | `Promise<{ patch: any; output: { subgraphId: any; inputPath: string; input: {} | null; }; status: string; }>` | - |
| `RouterNodeExecutor` | ctx, config | `Promise<{ patch: any; status: string; }>` | - |
| `ParallelNodeExecutor` | ctx, config | `Promise<{ patch: any; output: { branches: string[]; maxConcurrency: any; }; status: string; }>` | - |
| `LoopNodeExecutor` | ctx, config | `Promise<{ patch: any; output: { shouldContinue: boolean; nextNode: any; }; status: string; }>` | - |
| `LLMNodeExecutor` | ctx, config | `Promise<{ patch: any; output: any; status: string; }>` | - |
| `JoinNodeExecutor` | ctx, config | `Promise<{ patch: any; output: Record<string, unknown>; status: string; }>` | - |
| `TransformNodeExecutor` | ctx, config | `Promise<{ status: string; error?: undefined; patch?: undefined; output?: undefined; } | { status: string; error: string; patch?: undefined; output?: undefined; } | { status: string; patch: any; output: any; error?: undefined; }>` | Transform 节点执行器。

- 若 config.handler 存在 → 从 StepHandlerRegistry 分发执行
- 若 config.handler 不存在 → 保持原有 identity 行为（直接 completed） |
| `HumanInputNodeExecutor` | ctx, config | `Promise<{ status: string; pauseReason: string; output: { prompt: any; timeoutMs: any; inputPath: any; }; }>` | - |
| `resumeHumanInputNode` | ctx, config, input | `Promise<{ patch: ReturnType<typeof buildPatch>; output: { input: unknown; }; status: "completed"; }>` | - |

### src/graph/event-store

*No exported functions*

### src/graph/dsl

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `validateGraphDSL` | input | `GraphDSLValidationResult` | - |
| `parseGraphDSL` | input | `GraphDefinition` | - |
| `compileGraphDSL` | input | `GraphDefinition` | - |

### src/graph/checkpointer

*No exported functions*

### src/graph/builtin

*No exported functions*

### src/tools/builtin/client

*No exported functions*

## Type Index

| Type | Kind | Description |
|------|------|-------------|
| `BuiltinAgentTemplate` | interface | Shape of a builtin agent template.
`definition` contains every field of an AgentDefinition **except**
`llm.providerId`, which is supplied by the user when enabling. |
| `ToolConfirmationPolicy` | type | Determines when a tool requires explicit user confirmation before execution.
- `auto_allow` — Execute immediately without user confirmation (read-only / low-risk).
- `session_trust` — Respect the session-level trust policy.
- `always_confirm` — Always require explicit user confirmation (high-risk / destructive). |
| `ToolTarget` | type | Where the tool executes.
- `server` — Executes on the backend (current default).
- `client` — Executes on the user's browser; the backend delegates via streaming protocol. |
| `ToolExecutionContext` | type | - |
| `AgentToolDefinition` | type | - |
| `ResolvedGraphRuntimeContext` | type | - |
| `ResolveRuntimeForSessionParams` | type | - |
| `ResolveRuntimeForRunParams` | type | - |
| `RuntimeResolutionService` | type | - |
| `RuntimePromptStrategy` | type | - |
| `PersistedToolSchemaSnapshot` | type | - |
| `AgentRunRuntimeRef` | type | - |
| `FimOptions` | type | - |
| `FimChunk` | type | - |
| `CompletionOptions` | type | - |
| `CompletionChunk` | type | - |
| `AgentSessionMeta` | type | - |
| `ResolvedSession` | interface | - |
| `WorkflowEventMeta` | interface | - |
| `RunId` | type | - |
| `NodeId` | type | - |
| `EventId` | type | - |
| `RunStatus` | type | - |
| `BlackboardSnapshot` | type | - |
| `PatchMetadata` | type | - |
| `Patch` | type | - |
| `NodeType` | type | - |
| `NodeDefinition` | type | - |
| `EdgeCondition` | type | - |
| `EdgeDefinition` | type | - |
| `GraphDefinition` | type | - |
| `NodeExecutionResult` | type | - |
| `NodeExecutionContext` | type | - |
| `RetryConfig` | type | - |
| `GraphRuntimeContext` | type | - |
| `SchedulerOptions` | type | - |
| `SchedulerStartOptions` | type | - |
| `SchedulerRecoverOptions` | type | - |
| `StoredGraphRuntime` | type | - |
| `RuntimeAwareSchedulerStartOptions` | type | - |
| `NodeExecutorContext` | type | - |
| `NodeExecutor` | type | - |
| `ExecutorTaskInput` | type | - |
| `LeaseStatus` | type | - |
| `LeaseRecord` | type | - |
| `LeaseManager` | type | - |
| `DefaultGraphRuntime` | type | - |
| `ExecutorTask` | type | - |
| `ExecutorPool` | type | - |
| `EventType` | type | - |
| `EventPayloadMap` | type | Maps each EventType to its inferred payload type. |
| `AgentEventPayload` | type | - |
| `AgentEvent` | type | - |
| `AgentEventOf` | type | - |
| `AgentEventLike` | type | - |
| `EventHandler` | type | - |
| `EventEnvelopeInput` | type | - |
| `WaitForEventArgs` | type | - |
| `EventBus` | type | - |
| `DistributedEventBus` | interface | - |
| `DistributedCheckpointer` | interface | - |
| `DistributedExecutorPool` | interface | - |
| `WorkerStatus` | type | 分布式扩展点

当前实现为单机版本：
- EventBus: InProcessEventBus
- Checkpointer: Memory/Postgres（后续）
- ExecutorPool: LocalExecutorPool
- Scheduler: Single process |
| `CompensationHandler` | type | - |
| `CompensationRecord` | type | - |
| `CompensationRegistry` | type | - |
| `CacheKeyStrategy` | type | - |
| `CacheOptions` | type | - |
| `CacheStore` | type | - |
| `SeedVariables` | type | 种子变量 — 由调用方直接提供，不需要任何 provider 解析。
这些变量是整个依赖链的根节点。

示例种子变量：userId, projectId, languageId, sourceLanguageId,
documentId, elementId 等（从 session metadata 提取）。 |
| `ResolveOptions` | type | - |
| `TermDiscoveryInput` | type | - |
| `TermDiscoveryConfig` | type | - |
| `TermDiscoveryCandidate` | type | - |
| `TermDiscoveryResult` | type | - |
| `TermAlignmentInput` | type | - |
| `AlignmentCandidate` | type | - |
| `AlignedGroup` | type | - |
| `AlignedTerm` | type | - |
| `TermAlignmentResult` | type | - |
| `QAPubPayload` | type | - |
| `CreateTranslationPubPayload` | type | - |
| `BatchAutoTranslateInput` | type | - |
| `BatchAutoTranslateOutput` | type | - |
| `AutoTranslateConfig` | type | - |
| `AutoTranslateInput` | type | - |
| `AutoTranslateOutput` | type | - |
| `TypedNodeContext` | type | Step handler 执行时注入的上下文 |
| `TypedNodeDef` | type | 一个类型安全的节点声明 |
| `TypedGraphOptions` | type | defineTypedGraph 的选项 |
| `TypedGraphDefinition` | type | defineTypedGraph 的返回值 |
| `StepHandler` | type | - |
| `RunGraphOptions` | type | - |
| `GraphRunHandle` | type | - |
| `EventStore` | type | - |
| `GraphDSLValidationResult` | type | - |
| `RunMetadata` | type | - |
| `ExternalOutputRecord` | type | - |
| `Checkpointer` | type | - |


*Last updated: 2026-04-02*