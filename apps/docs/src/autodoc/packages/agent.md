# @cat/agent

Agent runtime: DAG loop controller, prompt engine, LLM gateway, definition parser

## Overview

* **Modules**: 27

* **Exported functions**: 17

* **Exported types**: 52

## Function Index

### packages/agent/src/dag

### `buildAgentDAG`

```ts
/**
 * Build the Agent DAG graph definition (PreCheck → Reasoning → Tool/Decision → loop).
 *
 * This definition is used for schema validation and GraphRegistry.
 * The actual execution logic is implemented imperatively by AgentRuntime calling each node function.
 */
export const buildAgentDAG = (): { id: string; version: string; nodes: Record<string, { id: string; type: "llm" | "tool" | "router" | "parallel" | "join" | "human_input" | "transform" | "loop" | "subgraph"; timeoutMs: number; config?: any; idempotency?: { enabled: boolean; keyTemplate?: string | undefined; } | undefined; retry?: { maxAttempts: number; backoffMs: number; backoffMultiplier: number; } | undefined; humanInput?: { prompt: string; timeoutMs?: number | undefined; } | undefined; }>; edges: { from: string; to: string; condition?: { field: string; operator: "eq" | "neq" | "exists" | "not_exists" | "in" | "gt" | "lt"; value?: unknown; description?: string | undefined; } | undefined; label?: string | undefined; }[]; entry: string; description?: string | undefined; exit?: string[] | undefined; config?: { maxConcurrentNodes: number; defaultTimeoutMs: number; enableCheckpoints: boolean; checkpointIntervalMs: number; } | undefined; }
```

### packages/agent/src/dag/nodes

### `runDecisionNode`

```ts
/**
 * DecisionNode: decides whether the DAG loop should continue based on Blackboard state.
 *
 * Routing priority (high to low):
 * 1. finish tool was called → route to completion
 * 2. maxTurns exhausted → route to failure
 * 3. timeout exceeded → route to failure
 * 4. otherwise → route back to PreCheck to continue loop
 *
 * @param data - Current Blackboard data
 * @param ctx - Agent node context
 *
 * @returns DecisionOutcome
 */
export const runDecisionNode = (data: AgentBlackboardData, ctx: Pick<AgentNodeContext, "constraints" | "startedAt" | "logger">): DecisionOutcome
```

### `runPreCheckNode`

```ts
/**
 * PreCheckNode (Phase 0b): step/timeout check + Kanban DAG dependency check + Blackboard update.
 */
export const runPreCheckNode = async (data: AgentBlackboardData, ctx: PreCheckContext): Promise<PreCheckResult>
```

### `collectLLMResponse`

```ts
/**
 * Consume AsyncIterable<LLMChunk> stream and aggregate into a complete LLM response.
 *
 * @param stream - LLM streaming output
 * @param onChunk - Optional per-chunk callback for real-time thinking delta forwarding
 *
 * @returns Aggregated LLM response
 */
export const collectLLMResponse = async (stream: AsyncIterable<LLMChunk>, onChunk?: (chunk: LLMChunk) => void): Promise<CollectedLLMResponse>
```

### `runReasoningNode`

```ts
/**
 * ReasoningNode: reads message history from Blackboard, calls LLMGateway,
 * aggregates the response, then writes tool calls and output snapshot back to Blackboard.
 *
 * @param data - Current Blackboard data
 * @param ctx - Agent node context
 * @param definition - Parsed agent definition (with tools and llm config)
 *
 * @returns ReasoningNodeResult
 */
export const runReasoningNode = async (data: AgentBlackboardData, ctx: AgentNodeContext, definition: {
    content: string;
    metadata: {
      tools: string[];
      llm?: { temperature?: number; maxTokens?: number };
    };
  }): Promise<ReasoningNodeResult>
```

### `runToolNode`

```ts
/**
 * ToolNode: reads tool call list from Blackboard, executes all tools concurrently,
 * and writes results back to Blackboard.
 *
 * @param data - Current Blackboard data
 * @param ctx - Agent node context
 *
 * @returns ToolNodeResult
 */
export const runToolNode = async (data: AgentBlackboardData, ctx: Pick<
    AgentNodeContext,
    "toolRegistry" | "sessionId" | "agentId" | "projectId" | "logger"
  >): Promise<ToolNodeResult>
```

### packages/agent/src/definition

### `parseAgentDefinition`

```ts
/**
 * Parse an agent MD definition file using the remark pipeline, extracting
 * frontmatter metadata and body content.
 *
 * @param markdown - Full Markdown text including YAML frontmatter
 *
 * @returns ParsedAgentDefinition with validated metadata and body content
 */
export const parseAgentDefinition = (markdown: string): ParsedAgentDefinition
```

### packages/agent/src/kanban

### `estimateBatchSize`

```ts
/**
 * Estimate batch size based on document elements, average length, and complexity.
 *
 * @param input - Batch size estimation inputs
 */
export const estimateBatchSize = (input: BatchSizeInput): number
```

### packages/agent/src/observability

### `createAgentLogger`

```ts
/**
 * Create an AgentLogger instance from a base Logger.
 *
 * @param baseLogger - Base logger
 *
 * @returns AgentLogger instance
 */
export const createAgentLogger = (baseLogger: Logger): AgentLogger
```

### `createNoopAgentLogger`

```ts
/**
 * Create a no-op AgentLogger (for testing and placeholders).
 */
export const createNoopAgentLogger = (): AgentLogger
```

### packages/agent/src/prompt

### `estimateTokens`

```ts
/**
 * Lightweight token estimation: approximates by dividing character count by 4.
 */
export const estimateTokens = (msg: ChatMessage): number
```

### `interpolate`

```ts
/**
 * Simple {{variable}} string interpolation.
 *
 * @param template - Template string with {{key
 * @param variables - Variable key-value pairs
 *
 * @returns The interpolated string
 */
export const interpolate = (template: string, variables: Record<string, string>): string
```

### packages/agent/src/seeds

### `seedTranslatorAgent`

```ts
/**
 * Idempotent seed: ensures the built-in translator agent definition exists.
 */
export const seedTranslatorAgent = async (db: DbHandle): Promise<void>
```

### packages/agent/src/vcs

### `registerAllDiffStrategies`

```ts
/**
 * Register all 13 entityType diff strategies into the registry
 */
export const registerAllDiffStrategies = (registry: DiffStrategyRegistry)
```

### packages/agent/src/vcs/methods

### `createSimpleMethods`

```ts
/**
 * Create SimpleApplicationMethod instances for multiple entityTypes.
 */
export const createSimpleMethods = (entityTypes: string[]): SimpleApplicationMethod[]
```

### packages/agent/src/vcs/strategies

### `shallowDiff`

```ts
/**
 * Shallow field-level diff between two objects, returning changed fields
 */
export const shallowDiff = (before: Record<string, unknown> | null, after: Record<string, unknown> | null): FieldChange[]
```

### `createGenericStrategy`

```ts
/**
 * Generic strategy factory using shallowDiff
 */
export const createGenericStrategy = (options: {
  entityType: string;
  semanticLabel: string;
  impactScope: "LOCAL" | "CASCADING";
  watchedFields?: string[];
}): DiffStrategy<unknown>
```

## Type Index

* `AgentBlackboardData` (interface) — Blackboard data structure used by the Agent DAG (stored in Blackboard.data).

* `AgentNodeContext` (interface) — Shared execution context for all Agent DAG nodes.

* `DecisionOutcome` (type) — DecisionNode routing decision result.

* `PreCheckResult` (interface) — PreCheckNode execution result.

* `PreCheckServices` (interface) — Optional services available to PreCheckNode.

* `PreCheckContext` (type)

* `CollectedLLMResponse` (interface) — Aggregated LLM response.

* `ReasoningNodeResult` (interface) — ReasoningNode execution result.

* `ToolNodeResult` (interface) — ToolNode execution result.

* `BatchSizeInput` (interface) — Heuristic function for automatically estimating Kanban card batchSize.

* `LLMGatewayOptions` (interface) — LLMGateway initialization options.

* `LLMGatewayRequest` (interface) — Options for issuing an LLM request through LLMGateway.

* `LLMPriority` (type) — Priority levels for LLM requests: CRITICAL > HIGH > NORMAL > LOW

* `AgentRunLogEvent` (interface) — L01: Agent run-level log event (run start/end).

* `AgentDAGNodeLogEvent` (interface) — L02: DAG node log event (each node enter/exit).

* `AgentLLMCallLogEvent` (interface) — L03: LLM call log event.

* `AgentToolExecuteLogEvent` (interface) — L04: Tool execution log event.

* `AgentErrorLogEvent` (interface) — L05: Agent error log event.

* `AgentChangeSetLogEvent` (interface) — L06: ChangeSet event log (created, reviewed, applied, rolled\_back).

* `AgentKanbanDepLogEvent` (interface) — L07: Kanban card dependency event log.

* `AgentLogger` (interface) — Agent structured logger interface.

* `AgentMetricsSnapshot` (interface) — Agent metrics snapshot with counters and distribution data.

* `CompressionConfig` (interface) — Compression pipeline configuration.

* `CompressionStats` (interface) — Statistics from a compression run.

* `SlotPolicy` (interface) — Injection policy configuration for a single slot.

* `PromptConfig` (interface) — Dynamic configuration for PromptEngine.

* `BuildPromptInput` (interface) — Input parameters for PromptEngine.buildPrompt().

* `BuiltPrompt` (interface) — Output of buildPrompt(): the fully constructed message list.

* `AgentRuntimeConfig` (interface) — AgentRuntime initialization configuration.

* `AgentEvent` (type) — Union type of events emitted by AgentRuntime.runLoop().

* `ErrorRecoveryBudget` (interface) — Error recovery budget snapshot, used to persist current budget consumption.

* `CreateSessionParams` (interface) — Parameters for SessionManager.createSession().

* `CreateSessionResult` (interface) — Return value of SessionManager.createSession().

* `SessionState` (interface) — Loaded session state for use by AgentRuntime.

* `ToolExecutionContext` (interface) — Tool execution context: provides session, permission checks, cost status, and VCS mode.

* `AgentToolDefinition` (interface) — Agent tool definition. Each tool declares its name, description, parameter schema, side-effect type, security level, and execution function.

* `SideEffectType` (type) — The side-effect type of a tool

* `ToolSecurityLevel` (type) — Security level required to execute a tool

* `ChangesetEntry` (interface) — Core fields of a changeset entry (mirrors the DB changesetEntry row).

* `AsyncDependencySpec` (interface) — Async dependency spec describing background tasks that must complete when applying a changeset entry.

* `ApplicationResult` (interface) — Result of applying a changeset entry.

* `DependencyStatus` (interface) — Readiness status of an async dependency.

* `ApplicationContext` (interface) — Context for applying a changeset entry.

* `ApplicationMethod` (interface) — Application method interface, separating synchronous CRUD from async-dependent operations.

* `Changeset` (interface) — Changeset summary for internal agent use.

* `CreateChangeSetParams` (interface)

* `AddEntryParams` (interface)

* `ChangeSetFilters` (interface)

* `FieldChange` (interface) — Field-level change description

* `DiffResult` (interface) — Diff computation result

* `DiffStrategy` (interface) — Entity diff strategy interface

* `VCSContext` (interface) — VCS operation context — determines whether to generate audit records.
