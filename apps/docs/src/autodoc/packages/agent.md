# @cat/agent

Agent and Workflow graph executor

## Overview

* **Modules**: 57

* **Exported functions**: 56

* **Exported types**: 99

## Function Index

### packages/agent/src

### `getBuiltinAgentTemplate`

```ts
/**
 * Look up a builtin template by its stable `templateId`.
 */
export const getBuiltinAgentTemplate = (templateId: string): BuiltinAgentTemplate | undefined
```

### packages/agent/src/context

### `createBuiltinProviders`

```ts
/**
 * 创建内置 provider 实例数组。
 *
 * 注意：`BuiltinGlossaryProvider` 需要直接访问 DB，
 * 因此独立于 ContextResolveContext 直接注入 drizzle 客户端。
 * （这与 resolver 传递给 resolve() 的 drizzle 是同一个实例。）
 */
export const createBuiltinProviders = (params: {
  definition: AgentDefinition;
  tools: ReadonlyArray<AgentToolDefinition>;
  drizzle: DrizzleClient;
}): [BuiltinGlossaryProvider, BuiltinContextDescriptionProvider, BuiltinToolDescriptionProvider]
```

### `resolveContextVariables`

```ts
/**
 * 变量解析引擎。
 *
 * 执行流程：
 * 1. 将 seeds 写入初始 Map
 * 2. 收集所有 provider 的 provides/dependencies 声明
 * 3. 调用 topoSortProviders 得到执行顺序（同时完成环路检测）
 * 4. 按拓扑层顺序执行 provider.resolve()（同层 Promise.all 并行）
 *    - 跳过必需依赖缺失的 provider（警告日志）
 *    - 可选依赖缺失时正常调用
 *    - 权限拒绝时跳过（警告日志）
 *    - 将 resolve 返回的变量合并入 Map（键冲突时后者覆盖）
 * 5. 返回最终完整的 Map<string, string | number | boolean>
 */
export const resolveContextVariables = async (options: ResolveOptions): Promise<Map<string, string | number | boolean>>
```

### `topoSortProviders`

```ts
/**
 * 对 provider 列表执行拓扑排序，返回分层结果。
 *
 * 算法：Kahn's Algorithm
 * 1. 构建 variableKey → providerIndex 的"谁提供了什么"映射
 * 2. 构建 providerIndex → Set<providerIndex> 的邻接表（依赖关系）
 * 3. 入度为 0 的 provider 先执行
 * 4. 若最终排序结果数量 < provider 数量，说明存在环路
 * @returns 排序后的分层结果 layers，同一层可并行执行
 * @throws CircularDependencyError 当检测到环路时，附带环路路径信息
 *
 * @returns 排序后的分层结果 layers，同一层可并行执行
 */
export const topoSortProviders = (providers: ReadonlyArray<ProviderShape>): number[][]
```

### packages/agent/src/db

### `withAgentDb`

```ts
/**
 * app-agent 自己保留这层薄适配，主要是为了：
 * 1. 让 workflow / tools 不再直接接触 getDrizzleDB()
 * 2. 统一默认 command collector 策略（当前为 noopCollector）
 * 3. 在需要组合多个 c/q 或显式事务时，仍保留最小的入口层编排能力
 *
 * 它不是新的业务层，只是 agent 运行时的 DB / domain 边界适配器。
 */
export const withAgentDb = async (handler: (db: DrizzleClient) => Promise<TResult>): Promise<TResult>
```

### `withAgentDbTransaction`

```ts
export const withAgentDbTransaction = async (handler: (tx: DrizzleTransaction) => Promise<TResult>): Promise<TResult>
```

### `runAgentQuery`

```ts
export const runAgentQuery = async (query: Query<Q, R>, input: Q): Promise<R>
```

### `runAgentCommand`

```ts
export const runAgentCommand = async (command: Command<C, R>, input: C): Promise<R>
```

### packages/agent/src/graph

### `createPatchMetadata`

```ts
export const createPatchMetadata = (args: {
  actorId: NodeId;
  parentSnapshotVersion: number;
}): { patchId: string; parentSnapshotVersion: number; actorId: string; timestamp: string; }
```

### `buildPatch`

```ts
export const buildPatch = (args: {
  actorId: NodeId;
  parentSnapshotVersion: number;
  updates: Record<string, unknown>;
}): { metadata: { patchId: string; parentSnapshotVersion: number; actorId: string; timestamp: string; }; updates: any; }
```

### `generateCacheKey`

```ts
export const generateCacheKey = (payload: unknown): string
```

### `resolveCacheKey`

```ts
export const resolveCacheKey = (namespace: string, payload: unknown, options?: CacheOptions): string | null
```

### `createAgentEvent`

```ts
export const createAgentEvent = (eventLike: AgentEventLike): AgentEvent
```

### `normalizeEventEnvelope`

```ts
export const normalizeEventEnvelope = (runId: string, nodeId: string | undefined, eventLike: EventEnvelopeInput): AgentEventLike
```

### `createDefaultGraphRuntime`

```ts
export const createDefaultGraphRuntime = (drizzle: DrizzleClient, pluginManager: PluginManager): DefaultGraphRuntime
```

### `storeGraphRuntime`

```ts
export const storeGraphRuntime = (runtime: StoredGraphRuntime)
```

### `getStoredGraphRuntime`

```ts
export const getStoredGraphRuntime = (): StoredGraphRuntime
```

### packages/agent/src/graph/dsl

### `compileGraphDSL`

```ts
export const compileGraphDSL = (input: unknown): { id: string; version: string; nodes: Record<string, { id: string; type: "llm" | "tool" | "router" | "parallel" | "join" | "human_input" | "transform" | "loop" | "subgraph"; timeoutMs: number; config?: any; idempotency?: { enabled: boolean; keyTemplate?: string | undefined; } | undefined; retry?: { maxAttempts: number; backoffMs: number; backoffMultiplier: number; } | undefined; humanInput?: { prompt: string; timeoutMs?: number | undefined; } | undefined; }>; edges: { from: string; to: string; condition?: { type: "expression" | "schema_match" | "blackboard_field"; value: string; description?: string | undefined; } | undefined; label?: string | undefined; }[]; entry: string; description?: string | undefined; exit?: string[] | undefined; config?: { maxConcurrentNodes: number; defaultTimeoutMs: number; enableCheckpoints: boolean; checkpointIntervalMs: number; } | undefined; }
```

### `parseGraphDSL`

```ts
export const parseGraphDSL = (input: unknown): { id: string; version: string; nodes: Record<string, { id: string; type: "llm" | "tool" | "router" | "parallel" | "join" | "human_input" | "transform" | "loop" | "subgraph"; timeoutMs: number; config?: any; idempotency?: { enabled: boolean; keyTemplate?: string | undefined; } | undefined; retry?: { maxAttempts: number; backoffMs: number; backoffMultiplier: number; } | undefined; humanInput?: { prompt: string; timeoutMs?: number | undefined; } | undefined; }>; edges: { from: string; to: string; condition?: { type: "expression" | "schema_match" | "blackboard_field"; value: string; description?: string | undefined; } | undefined; label?: string | undefined; }[]; entry: string; description?: string | undefined; exit?: string[] | undefined; config?: { maxConcurrentNodes: number; defaultTimeoutMs: number; enableCheckpoints: boolean; checkpointIntervalMs: number; } | undefined; }
```

### `validateGraphDSL`

```ts
export const validateGraphDSL = (input: unknown): GraphDSLValidationResult
```

### packages/agent/src/graph/executors

### `HumanInputNodeExecutor`

```ts
export const HumanInputNodeExecutor: NodeExecutor = async (ctx: NodeExecutorContext, config: Record) => {...}
```

### `resumeHumanInputNode`

```ts
export const resumeHumanInputNode = async (ctx: Parameters<NodeExecutor>[0], config: Record<string, unknown>, input: unknown): Promise<{ patch: ReturnType<typeof buildPatch>; output: { input: unknown; }; status: "completed"; }>
```

### `TransformNodeExecutor`

```ts
/**
 * Transform 节点执行器。
 *
 * - 若 config.handler 存在 → 从 StepHandlerRegistry 分发执行
 * - 若 config.handler 不存在 → 保持原有 identity 行为（直接 completed）
 */
export const TransformNodeExecutor: NodeExecutor = async (ctx: NodeExecutorContext, config: Record) => {...}
```

### `JoinNodeExecutor`

```ts
export const JoinNodeExecutor: NodeExecutor = async (ctx: NodeExecutorContext, config: Record) => {...}
```

### `LLMNodeExecutor`

```ts
export const LLMNodeExecutor: NodeExecutor = async (ctx: NodeExecutorContext, config: Record) => {...}
```

### `LoopNodeExecutor`

```ts
export const LoopNodeExecutor: NodeExecutor = async (ctx: NodeExecutorContext, config: Record) => {...}
```

### `ParallelNodeExecutor`

```ts
export const ParallelNodeExecutor: NodeExecutor = async (ctx: NodeExecutorContext, config: Record) => {...}
```

### `RouterNodeExecutor`

```ts
export const RouterNodeExecutor: NodeExecutor = async (ctx: NodeExecutorContext, config: Record) => {...}
```

### `SubgraphNodeExecutor`

```ts
export const SubgraphNodeExecutor: NodeExecutor = async (ctx: NodeExecutorContext, config: Record) => {...}
```

### `ToolNodeExecutor`

```ts
export const ToolNodeExecutor: NodeExecutor = async (ctx: NodeExecutorContext, config: Record) => {...}
```

### `resolvePath`

```ts
export const resolvePath = (data: unknown, path: string): unknown
```

### `interpolateTemplate`

```ts
export const interpolateTemplate = (template: string, data: unknown): string
```

### `hashArgs`

```ts
export const hashArgs = (args: Record<string, unknown>): string
```

### packages/agent/src/graph/typed-dsl

### `defineTypedGraph`

```ts
/**
 * 声明一个类型安全的 DAG 工作流。
 *
 * - 编译阶段：泛型推断保证节点 input/output schema 匹配
 * - 运行时：输出标准 GraphDefinition + 注册 step handler
 * - 执行时：增强的 TransformNodeExecutor 通过 config.handler 分发
 */
export const defineTypedGraph = (options: TypedGraphOptions<TInput, TOutput, TNodes>): TypedGraphDefinition<TInput, TOutput>
```

### `defineNode`

```ts
/**
 * 辅助函数：显式声明一个类型安全节点，允许 TypeScript 正确推断 handler 参数类型。
 *
 * 用法：`defineNode({ input: schema, output: schema, handler: async (input) => {...} })`
 */
export const defineNode = (def: TypedNodeDef<TInput, TOutput>): TypedNodeDef<TInput, TOutput>
```

### `runGraph`

```ts
/**
 * Starts a typed graph as a new run and awaits completion.
 *
 * Uses the global runtime (scheduler, eventBus, checkpointer) initialised by
 * `createDefaultGraphRuntime`. The `pluginManager` is sourced from the global
 * runtime unless overridden via `options.pluginManager`.
 */
export const runGraph = async (graph: TypedGraphDefinition<TInput, TOutput>, input: z.input<TInput>, options?: RunGraphOptions): Promise<z.core.output<TOutput>>
```

### `startGraph`

```ts
/**
 * Starts a typed graph run and returns a handle containing the `runId`
 * and a `complete` promise.  Useful when the caller needs the `runId`
 * upfront (e.g. to filter graph-emitted events before the run finishes).
 */
export const startGraph = async (graph: TypedGraphDefinition<TInput, TOutput>, input: z.input<TInput>, options?: RunGraphOptions): Promise<GraphRunHandle<z.core.output<TOutput>>>
```

### `registerStepHandler`

```ts
export const registerStepHandler = (name: string, handler: StepHandler)
```

### `getStepHandler`

```ts
export const getStepHandler = (name: string): StepHandler<unknown, unknown> | undefined
```

### `hasStepHandler`

```ts
export const hasStepHandler = (name: string): boolean
```

### packages/agent/src/runtime

### `parseRuntimeRefFromMetadata`

```ts
export const parseRuntimeRefFromMetadata = (metadata: unknown): { sessionId: number; agentDefinitionId: number; userId: string; toolNames: string[]; toolSnapshot: { name: string; description: string; parameters: any; }[]; promptStrategy: "persisted" | "rebuild"; llmProviderDbId?: number | null | undefined; persistedSystemPrompt?: string | undefined; } | null
```

### `withRuntimeRefMetadata`

```ts
export const withRuntimeRefMetadata = (params: {
  sessionId?: number;
  runtimeRef?: AgentRunRuntimeRef;
  metadata?: Record<string, unknown> | null;
}): Record<string, unknown> | null
```

### `createRuntimeResolver`

```ts
export const createRuntimeResolver = (options: RuntimeResolverOptions): RuntimeResolver
```

### packages/agent/src/session

### `rebuildConversationFromRuns`

```ts
/**
 * Rebuild the conversation history (ChatMessage[]) for a session by reading
 * the Blackboard snapshot from the last completed AgentRun.
 *
 * Strategy: Blackboard Snapshot method
 * - Each completed Graph Run leaves a `messages` array in its Blackboard snapshot.
 * - We read only the most recent completed run's snapshot to get the full history.
 * - Falls back to a system-prompt-only array if no completed runs exist yet.
 */
export const rebuildConversationFromRuns = async (drizzle: DrizzleClient, sessionInternalId: number, systemPrompt: string): Promise<ChatMessage[]>
```

### `buildSystemPrompt`

```ts
/**
 * Build the fully-interpolated system prompt for an agent run.
 *
 * Pipeline:
 * 1. Expand seed variables (userId + session metadata fields)
 * 2. Assemble builtin providers + plugin-supplied context providers
 * 3. Run the topological context resolution engine
 * 4. Replace all {{key}} placeholders in the system prompt
 *
 * All context variables are derived from **server-side** sources to prevent
 * prompt-injection via forged client values. Plugin context providers
 * registered via the AGENT_CONTEXT_PROVIDER service can augment the
 * variable set at runtime.
 */
export const buildSystemPrompt = async (params: {
  drizzle: DrizzleClient;
  definition: AgentDefinition;
  seedsVars: Record<string, string | number | boolean>;
  userId: string;
  tools: ReadonlyArray<AgentToolDefinition>;
  /** Context providers from PluginManager.getServices("AGENT_CONTEXT_PROVIDER") */
  contextProviders?: AgentContextProvider[];
  /** Optional permission check hook (defaults to allow-all) */
  checkPermission?: (resource: string, action: string) => Promise<boolean>;
}): Promise<string>
```

### `resolveSession`

```ts
/**
 * Load and validate an agent session from the DB.
 * @param - When provided, an additional `userId` WHERE condition is
 * applied (used by the HTTP endpoint for ownership checks). Workers that
 * have already been authorised at enqueue time can omit this.
 * @throws if the session is not found or not `ACTIVE`.
 *
 * @param userId - - When provided, an additional `userId` WHERE condition is
applied (used by the HTTP endpoint for ownership checks). Workers that
have already been authorised at enqueue time can omit this.
 */
export const resolveSession = async (drizzle: DrizzleClient, sessionExternalId: string, userId?: string): Promise<ResolvedSession>
```

### `resolveDefinition`

```ts
/**
 * Load and parse the agent definition for the given DB-internal definition ID.
 */
export const resolveDefinition = async (drizzle: DrizzleClient, agentDefinitionId: number): Promise<{ id: string; name: string; description: string; version: string; type: "GENERAL" | "GHOST_TEXT" | "WORKFLOW"; systemPrompt: string; tools: string[]; icon?: string | undefined; llm?: { providerId: number; temperature?: number | undefined; maxTokens?: number | undefined; } | undefined; systemPromptVariables?: Record<string, { type: "string" | "number" | "boolean"; source: "config" | "input" | "context"; name?: string | undefined; description?: string | undefined; }> | undefined; constraints?: { maxSteps: number; maxConcurrentToolCalls: number; timeoutMs: number; maxCorrectionAttempts: number; } | undefined; orchestration?: { mode: "pipeline"; stages: { agentId: string; outputKey: string; inputFrom?: string | string[] | undefined; }[]; } | null | undefined; }>
```

### `mapSessionMetaToSeeds`

```ts
export const mapSessionMetaToSeeds = (metadata: unknown): Record<string, string | number | boolean>
```

### `setupToolRegistry`

```ts
export const setupToolRegistry = (params: {
  definition: AgentDefinition;
}): AgentToolDefinition[]
```

### packages/agent/src/tools

### `createToolRegistry`

```ts
/**
 * Create a new ToolRegistry instance
 */
export const createToolRegistry = (): ToolRegistry
```

### `defineTool`

```ts
/**
 * Factory that infers the schema output type for `execute`, so args are
 * fully typed without manually calling `parameters.parse()` inside each tool.
 *
 * The agent framework calls `parameters.parse()` automatically before invoking
 * `execute`, so individual tools never need to validate args themselves.
 */
export const defineTool = (def: {
  name: string;
  description: string;
  parameters: TSchema;
  execute: (
    args: ZodOutput<TSchema>,
    ctx: ToolExecutionContext,
  ) => Promise<unknown>;
  timeoutMs?: number;
  target?: ToolTarget;
  confirmationPolicy?: ToolConfirmationPolicy;
  isFinishTool?: boolean;
  // oxlint-disable-next-line no-unsafe-type-assertion -- safe: framework guarantees parameters.parse() before execute
}): AgentToolDefinition
```

### `defineClientTool`

```ts
/**
 * Define a client-side tool declaration that has no server `execute` implementation.
 * The backend registers this so the LLM knows the tool exists, but actual
 * execution is delegated to the frontend via the streaming protocol.
 */
export const defineClientTool = (def: {
  name: string;
  description: string;
  parameters: TSchema;
  confirmationPolicy?: ToolConfirmationPolicy;
}): AgentToolDefinition
```

### packages/agent/src/utils

### `generateToolDescriptions`

```ts
/**
 * Generate a formatted listing of available tools for injection into
 * the agent system prompt. Each tool is rendered as a bullet with its
 * name and description.
 *
 * Client-side tools are annotated with `[editor]` so the LLM knows they
 * operate in the user's browser editor.
 */
export const generateToolDescriptions = (tools: ReadonlyArray<AgentToolDefinition>): string
```

### `injectToolDescriptions`

```ts
/**
 * Inject auto-generated tool descriptions into a system prompt.
 *
 * Only activates when the prompt explicitly contains the
 * `{{toolDescriptions}}` placeholder — replaces all occurrences with
 * the generated text. If the placeholder is absent the prompt is
 * returned unchanged, since LLM providers already receive full tool
 * definitions via the structured `tools` parameter.
 *
 * Call this **after** resolving user-supplied variables so that
 * `{{toolDescriptions}}` is treated as a reserved built-in variable.
 */
export const injectToolDescriptions = (systemPrompt: string, tools: ReadonlyArray<AgentToolDefinition>): string
```

### `generateContextVariableDescriptions`

````ts
/**
 * Generate a formatted "Available context:" block from `systemPromptVariables`
 * definitions. Each variable is rendered as a bullet using its `name` (falling
 * back to the key) followed by the `{{key}}` interpolation token so that the
 * real values are substituted in the subsequent variable-resolution pass.
 *
 * Example output:
 * ```
 * Available context:
 * - Source language: {{sourceLanguageId}}
 * - Translation language: {{translationLanguageId}}
 * ```
 */
export const generateContextVariableDescriptions = (variables: Record<string, SystemPromptVariableEntry>): string
````

### `injectContextVariables`

```ts
/**
 * Inject an auto-generated context variables block into a system prompt.
 *
 * Only activates when the prompt contains the `{{contextVariables}}`
 * placeholder. The generated block still contains `{{key}}` tokens, so this
 * function **must be called before** user-supplied variable substitution so
 * that those tokens are resolved in the next pass.
 */
export const injectContextVariables = (systemPrompt: string, variables: Record<string, SystemPromptVariableEntry>): string
```

## Type Index

* `BuiltinAgentTemplate` (interface) — Shape of a builtin agent template.
  \`definition\` contains every field of an AgentDefinition \*\*except\*\*
  \`llm.providerId\`, which is supplied by the user when enabling.

* `SeedVariables` (type) — 种子变量 — 由调用方直接提供，不需要任何 provider 解析。
  这些变量是整个依赖链的根节点。

  示例种子变量：userId, projectId, languageId, sourceLanguageId,
  documentId, elementId 等（从 session metadata 提取）。

* `ResolveOptions` (type)

* `CacheKeyStrategy` (type)

* `CacheOptions` (type)

* `CacheStore` (type)

* `RunMetadata` (type)

* `ExternalOutputRecord` (type)

* `Checkpointer` (type)

* `CompensationHandler` (type)

* `CompensationRecord` (type)

* `CompensationRegistry` (type)

* `DistributedEventBus` (interface)

* `DistributedCheckpointer` (interface)

* `DistributedExecutorPool` (interface)

* `WorkerStatus` (type) — 分布式扩展点

  当前实现为单机版本：
  \- EventBus: InProcessEventBus
  \- Checkpointer: Memory/Postgres（后续）
  \- ExecutorPool: LocalExecutorPool
  \- Scheduler: Single process

* `GraphDSLValidationResult` (type)

* `WaitForEventArgs` (type)

* `EventBus` (type)

* `EventStore` (type)

* `EventType` (type)

* `EventPayloadMap` (type) — Maps each EventType to its inferred payload type.

* `AgentEventPayload` (type)

* `AgentEvent` (type)

* `AgentEventOf` (type)

* `AgentEventLike` (type)

* `EventHandler` (type)

* `EventEnvelopeInput` (type)

* `ExecutorTask` (type)

* `ExecutorPool` (type)

* `DefaultGraphRuntime` (type)

* `LeaseStatus` (type)

* `LeaseRecord` (type)

* `LeaseManager` (type)

* `NodeExecutorContext` (type)

* `NodeExecutor` (type)

* `ExecutorTaskInput` (type)

* `RuntimeAwareSchedulerStartOptions` (type)

* `StoredGraphRuntime` (type)

* `SchedulerOptions` (type)

* `SchedulerStartOptions` (type)

* `SchedulerRecoverOptions` (type)

* `RunGraphOptions` (type)

* `GraphRunHandle` (type)

* `StepHandler` (type)

* `TypedNodeContext` (type) — Step handler 执行时注入的上下文

* `TypedNodeDef` (type) — 一个类型安全的节点声明

* `TypedGraphOptions` (type) — defineTypedGraph 的选项

* `TypedGraphDefinition` (type) — defineTypedGraph 的返回值

* `RunId` (type)

* `NodeId` (type)

* `EventId` (type)

* `RunStatus` (type)

* `BlackboardSnapshot` (type)

* `PatchMetadata` (type)

* `Patch` (type)

* `NodeType` (type)

* `NodeDefinition` (type)

* `EdgeCondition` (type)

* `EdgeDefinition` (type)

* `GraphDefinition` (type)

* `NodeExecutionResult` (type)

* `NodeExecutionContext` (type)

* `RetryConfig` (type)

* `GraphRuntimeContext` (type)

* `WorkflowEventMeta` (interface)

* `CompletionOptions` (type)

* `CompletionChunk` (type)

* `FimOptions` (type)

* `FimChunk` (type)

* `RuntimePromptStrategy` (type)

* `PersistedToolSchemaSnapshot` (type)

* `AgentRunRuntimeRef` (type)

* `ResolvedGraphRuntimeContext` (type)

* `ResolveRuntimeForSessionParams` (type)

* `ResolveRuntimeForRunParams` (type)

* `RuntimeResolutionService` (type)

* `ResolvedSession` (interface)

* `AgentSessionMeta` (type)

* `ToolConfirmationPolicy` (type) — Determines when a tool requires explicit user confirmation before execution.
  \- \`auto\_allow\` — Execute immediately without user confirmation (read-only / low-risk).
  \- \`session\_trust\` — Respect the session-level trust policy.
  \- \`always\_confirm\` — Always require explicit user confirmation (high-risk / destructive).

* `ToolTarget` (type) — Where the tool executes.
  \- \`server\` — Executes on the backend (current default).
  \- \`client\` — Executes on the user's browser; the backend delegates via streaming protocol.

* `ToolExecutionContext` (type)

* `AgentToolDefinition` (type)

* `AutoTranslateConfig` (type)

* `AutoTranslateInput` (type)

* `AutoTranslateOutput` (type)

* `BatchAutoTranslateInput` (type)

* `BatchAutoTranslateOutput` (type)

* `CreateTranslationPubPayload` (type)

* `QAPubPayload` (type)

* `TermAlignmentInput` (type)

* `AlignmentCandidate` (type)

* `AlignedGroup` (type)

* `AlignedTerm` (type)

* `TermAlignmentResult` (type)

* `TermDiscoveryInput` (type)

* `TermDiscoveryConfig` (type)

* `TermDiscoveryCandidate` (type)

* `TermDiscoveryResult` (type)
