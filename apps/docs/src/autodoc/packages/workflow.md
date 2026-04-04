# @cat/workflow

DAG-based workflow graph executor

## Overview

* **Modules**: 36

* **Exported functions**: 27

* **Exported types**: 65

## Function Index

### packages/workflow/src/graph

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
export const createDefaultGraphRuntime = (drizzle: DrizzleClient, _pluginManager: PluginManager): DefaultGraphRuntime
```

### `storeGraphRuntime`

```ts
export const storeGraphRuntime = (runtime: StoredGraphRuntime)
```

### `getStoredGraphRuntime`

```ts
export const getStoredGraphRuntime = (): StoredGraphRuntime
```

### packages/workflow/src/graph/dsl

### `compileGraphDSL`

```ts
export const compileGraphDSL = (input: unknown): { id: string; version: string; nodes: Record<string, { id: string; type: "llm" | "tool" | "router" | "parallel" | "join" | "human_input" | "transform" | "loop" | "subgraph"; timeoutMs: number; config?: any; idempotency?: { enabled: boolean; keyTemplate?: string | undefined; } | undefined; retry?: { maxAttempts: number; backoffMs: number; backoffMultiplier: number; } | undefined; humanInput?: { prompt: string; timeoutMs?: number | undefined; } | undefined; }>; edges: { from: string; to: string; condition?: { field: string; operator: "eq" | "neq" | "exists" | "not_exists" | "in" | "gt" | "lt"; value?: unknown; description?: string | undefined; } | undefined; label?: string | undefined; }[]; entry: string; description?: string | undefined; exit?: string[] | undefined; config?: { maxConcurrentNodes: number; defaultTimeoutMs: number; enableCheckpoints: boolean; checkpointIntervalMs: number; } | undefined; }
```

### `parseGraphDSL`

```ts
export const parseGraphDSL = (input: unknown): { id: string; version: string; nodes: Record<string, { id: string; type: "llm" | "tool" | "router" | "parallel" | "join" | "human_input" | "transform" | "loop" | "subgraph"; timeoutMs: number; config?: any; idempotency?: { enabled: boolean; keyTemplate?: string | undefined; } | undefined; retry?: { maxAttempts: number; backoffMs: number; backoffMultiplier: number; } | undefined; humanInput?: { prompt: string; timeoutMs?: number | undefined; } | undefined; }>; edges: { from: string; to: string; condition?: { field: string; operator: "eq" | "neq" | "exists" | "not_exists" | "in" | "gt" | "lt"; value?: unknown; description?: string | undefined; } | undefined; label?: string | undefined; }[]; entry: string; description?: string | undefined; exit?: string[] | undefined; config?: { maxConcurrentNodes: number; defaultTimeoutMs: number; enableCheckpoints: boolean; checkpointIntervalMs: number; } | undefined; }
```

### `validateGraphDSL`

```ts
export const validateGraphDSL = (input: unknown): GraphDSLValidationResult
```

### packages/workflow/src/graph/executors

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

### `interpolateTemplate`

```ts
export const interpolateTemplate = (template: string, data: unknown): string
```

### `hashArgs`

```ts
export const hashArgs = (args: Record<string, unknown>): string
```

### packages/workflow/src/graph/typed-dsl

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

## Type Index

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

* `AgentEventBus` (type)

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

* `NodeExecutionResult` (type)

* `NodeExecutionContext` (type)

* `GraphRuntimeContext` (type)

* `WorkflowEventMeta` (interface)

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
