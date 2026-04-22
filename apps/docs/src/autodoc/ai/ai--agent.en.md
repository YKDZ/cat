# AI Agent Core

> **Section**: AI System  ·  **Subject ID**: `ai/agent`

**Primary package**: `@cat/agent`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `buildAgentDAG` | function | Build the Agent DAG graph definition (PreCheck → Reasoning → Tool/Decision → loo |
| `AgentBlackboardData` | interface | Blackboard data structure used by the Agent DAG (stored in Blackboard.data). |
| `AgentNodeContext` | interface | Shared execution context for all Agent DAG nodes. |
| `runDecisionNode` | function | DecisionNode: decides whether the DAG loop should continue based on Blackboard s |
| `DecisionOutcome` | type | DecisionNode routing decision result. |
| `runPreCheckNode` | function | PreCheckNode (Phase 0b): step/timeout check + Blackboard update. |
| `PreCheckResult` | interface | PreCheckNode execution result. |
| `PreCheckServices` | type | Optional services available to PreCheckNode. |
| `PreCheckContext` | type |  |
| `collectLLMResponse` | function | Consume AsyncIterable&lt;LLMChunk&gt; stream and aggregate into a complete LLM r |
| `runReasoningNode` | function | ReasoningNode: reads message history from Blackboard, calls LLMGateway,
aggregat |
| `CollectedLLMResponse` | interface | Aggregated LLM response. |
| `ReasoningNodeResult` | interface | ReasoningNode execution result. |
| `runToolNode` | function | ToolNode: reads tool call list from Blackboard, executes all tools concurrently, |
| `ToolNodeResult` | interface | ToolNode execution result. |
| `parseAgentDefinition` | function | Parse an agent MD definition file using the remark pipeline, extracting
frontmat |
| `LLMGatewayOptions` | interface | LLMGateway initialization options. |
| `LLMGatewayRequest` | interface | Options for issuing an LLM request through LLMGateway. |
| `LLMPriority` | type | Priority levels for LLM requests: CRITICAL &gt; HIGH &gt; NORMAL &gt; LOW |
| `createAgentLogger` | function | Create an AgentLogger instance from a base Logger. |
| `createNoopAgentLogger` | function | Create a no-op AgentLogger (for testing and placeholders). |
| `AgentRunLogEvent` | interface | L01: Agent run-level log event (run start/end). |
| `AgentDAGNodeLogEvent` | interface | L02: DAG node log event (each node enter/exit). |
| `AgentLLMCallLogEvent` | interface | L03: LLM call log event. |
| `AgentToolExecuteLogEvent` | interface | L04: Tool execution log event. |
| `AgentErrorLogEvent` | interface | L05: Agent error log event. |
| `AgentChangeSetLogEvent` | interface | L06: ChangeSet event log (created, reviewed, applied, rolled_back). |
| `AgentLogger` | interface | Agent structured logger interface. |
| `AgentMetricsSnapshot` | interface | Agent metrics snapshot with counters and distribution data. |
| `CompressionConfig` | interface | Compression pipeline configuration. |
| `CompressionStats` | interface | Statistics from a compression run. |
| `SlotPolicy` | interface | Injection policy configuration for a single slot. |
| `PromptConfig` | interface | Dynamic configuration for PromptEngine. |
| `BuildPromptInput` | interface | Input parameters for PromptEngine.buildPrompt(). |
| `BuiltPrompt` | interface | Output of buildPrompt(): the fully constructed message list. |
| `estimateTokens` | function | Lightweight token estimation: approximates by dividing character count by 4. |
| `interpolate` | function | Simple {{variable}} string interpolation. |
| `AgentRuntimeConfig` | interface | AgentRuntime initialization configuration. |
| `AgentEvent` | type | Union type of events emitted by AgentRuntime.runLoop(). |
| `ErrorRecoveryBudget` | interface | Error recovery budget snapshot, used to persist current budget consumption. |
| `buildPromptVariables` | function | Build the variable map passed to the PromptEngine. |
| `CreateSessionParams` | interface | Parameters for SessionManager.createSession(). |
| `CreateSessionResult` | interface | Return value of SessionManager.createSession(). |
| `SessionState` | interface | Loaded session state for use by AgentRuntime. |
| `registerBuiltinAgents` | function | Register or update all builtin agent GLOBAL template rows. Called on every start |
| `ToolExecutionContext` | interface | Tool execution context: provides session, permission checks, cost status, and VC |
| `AgentToolDefinition` | interface | Agent tool definition. Each tool declares its name, description, parameter schem |
| `SideEffectType` | type | The side-effect type of a tool |
| `ToolSecurityLevel` | type | Security level required to execute a tool |

## Related Topics

- [`domain/core`](../domain/domain--core.en.md)
