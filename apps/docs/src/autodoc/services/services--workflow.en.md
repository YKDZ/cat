# Workflow Engine

> **Section**: Services  ·  **Subject ID**: `services/workflow`

**Primary package**: `@cat/workflow`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `generateCacheKey` | function |  |
| `resolveCacheKey` | function |  |
| `CacheKeyStrategy` | type |  |
| `CacheOptions` | type |  |
| `CacheStore` | type |  |
| `RunMetadata` | type |  |
| `ExternalOutputRecord` | type |  |
| `Checkpointer` | type |  |
| `CompensationHandler` | type |  |
| `CompensationRecord` | type |  |
| `CompensationRegistry` | type |  |
| `DistributedEventBus` | interface |  |
| `DistributedCheckpointer` | interface |  |
| `DistributedExecutorPool` | interface |  |
| `WorkerStatus` | type | 分布式扩展点

当前实现为单机版本：
- EventBus: InProcessEventBus
- Checkpointer: Memory/Postgres |
| `defineGraph` | function | 声明一个类型安全的 DAG 工作流。

- 编译阶段：泛型推断保证节点 input/output schema 匹配
- 运行时：输出标准 GraphDefin |
| `defineNode` | function | 辅助函数：显式声明一个类型安全节点，允许 TypeScript 正确推断 handler 参数类型。

用法：`defineNode({ input: sche |
| `runGraph` | function | Starts a typed graph as a new run and awaits completion.

Uses the global runtim |
| `startGraph` | function | Starts a typed graph run and returns a handle containing the `runId`
and a `comp |
| `RunGraphOptions` | type |  |
| `GraphRunHandle` | type |  |
| `registerStepHandler` | function |  |
| `getStepHandler` | function |  |
| `hasStepHandler` | function |  |
| `StepHandler` | type |  |
| `TypedNodeContext` | type | Step handler 执行时注入的上下文 |
| `TypedNodeDef` | type | 一个类型安全的节点声明 |
| `TypedGraphOptions` | type | defineGraph 的选项 |
| `TypedGraphDefinition` | type | defineGraph 的返回值 |
| `WaitForEventArgs` | type |  |
| `AgentEventBus` | type |  |
| `EventStore` | type |  |
| `createAgentEvent` | function |  |
| `normalizeEventEnvelope` | function |  |
| `EventType` | type |  |
| `EventPayloadMap` | type | Maps each EventType to its inferred payload type. |
| `AgentEventPayload` | type |  |
| `AgentEvent` | type |  |
| `AgentEventOf` | type |  |
| `AgentEventLike` | type |  |
| `EventHandler` | type |  |
| `EventEnvelopeInput` | type |  |
| `ExecutorTask` | type |  |
| `ExecutorPool` | type |  |
| `HumanInputNodeExecutor` | function |  |
| `resumeHumanInputNode` | function |  |
| `TransformNodeExecutor` | function | Transform 节点执行器。

- 若 config.handler 存在 → 从 StepHandlerRegistry 分发执行
- 若 config. |
| `JoinNodeExecutor` | function |  |
| `LoopNodeExecutor` | function |  |
| `ParallelNodeExecutor` | function |  |
| *(41 more)* | | |

## Related Topics

- [`domain/core`](../domain/domain--core.en.md)
