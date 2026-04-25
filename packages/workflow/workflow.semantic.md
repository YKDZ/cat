---
subject: infra/workflow
---

`@cat/workflow` 在 `@cat/graph` 的 DAG 基础之上，提供面向业务的工作流 DSL、预定义任务注册表以及与 VCS 的透明集成，是 CAT 所有自动化流程的执行引擎。

## 工作流 DSL

```typescript
const myWorkflow = defineGraph({
  nodes: [
    defineNode("fetch", { type: "transform", handler: "fetchData" }),
    defineNode("process", { type: "transform", handler: "processData" }),
  ],
  edges: [{ from: "fetch", to: "process" }],
  entry: "fetch",
  exit: ["process"],
});
```

`defineGraph` / `defineNode` 是类型安全的工厂函数，确保节点 handler 存在于 `StepHandlerRegistry`。`runGraph(graph, initialData, runtime)` 启动图执行并返回最终黑板快照。

## 节点执行器类型

| 类型         | 行为                                          |
| ------------ | --------------------------------------------- |
| `Transform`  | 调用 handler 函数，将返回值 merge 到黑板      |
| `Router`     | 依据黑板状态通过 `EdgeCondition` 选择下一节点 |
| `Parallel`   | 并发执行多条出边对应的子图，等待全部完成      |
| `Join`       | 汇聚 Parallel 的多路结果到黑板                |
| `Loop`       | 循环执行子图直至 `exitCondition` 满足         |
| `SubGraph`   | 嵌套执行另一个 `GraphDefinition`              |
| `HumanInput` | 暂停执行并向用户请求输入，支持审核场景        |

## StepHandlerRegistry

`StepHandlerRegistry` 是全局的 handler 函数注册表，所有 Transform / Router 节点通过字符串键名引用 handler：

```typescript
StepHandlerRegistry.register("fetchData", async (ctx) => { ... });
```

系统预置了 **30+** 个内置 handler（位于 `packages/workflow/src/workflow/tasks/`），覆盖：翻译任务分发、自动翻译触发、记忆/术语查询、QA 检查、PR 创建与合并、文件解析、Agent 会话启动等。

## 运行时（GraphRuntime）

`createDefaultGraphRuntime()` 创建标准运行时实例，包含：

- 节点调度器（按拓扑顺序执行，支持并发分支）。
- 重试策略（指数退避，依据 `NodeDefinition.retryConfig`）。
- 超时守卫（依据 `NodeDefinition.timeout`，超时后注入 `AbortSignal`）。
- 执行事件流（`AsyncIterable<WorkflowEvent>`），供外部监听进度。

## VCS 透明集成

`executeWithVCS(fn, vcsContext)` 包装器在 handler 内部提供 VCS 上下文注入，使写操作自动路由到正确的分支（Direct 或 Isolation）：

```typescript
await executeWithVCS((vcs) => submitTranslation(elementId, text, { vcs }), {
  branchId,
  mode: "isolation",
});
```

这使 handler 编写者无需关心当前是否处于 PR 草稿分支，业务逻辑与 VCS 模式完全解耦。

## 自动翻译流水线

自动翻译是 `@cat/workflow` 最典型的跨包协作流程，通过监听 `element:created` 事件自动触发 `runAutoTranslatePipeline`，将候选翻译写入 open AUTO_TRANSLATE PR 的 changeset，最终由前端 overlay 读取并以 Ghost Text 形式呈现给译者。详细的端到端链路记录在 `infra/workflow` 主题的 Ghost Text 预翻译回显链路章节中。
