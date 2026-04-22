# 工作流引擎

> **Section**: 服务  ·  **Subject ID**: `services/workflow`

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

| 类型 | 行为 |
|---|---|
| `Transform` | 调用 handler 函数，将返回值 merge 到黑板 |
| `Router` | 依据黑板状态通过 `EdgeCondition` 选择下一节点 |
| `Parallel` | 并发执行多条出边对应的子图，等待全部完成 |
| `Join` | 汇聚 Parallel 的多路结果到黑板 |
| `Loop` | 循环执行子图直至 `exitCondition` 满足 |
| `SubGraph` | 嵌套执行另一个 `GraphDefinition` |
| `HumanInput` | 暂停执行并向用户请求输入，支持审核场景 |

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
await executeWithVCS(
  (vcs) => submitTranslation(elementId, text, { vcs }),
  { branchId, mode: "isolation" }
);
```

这使 handler 编写者无需关心当前是否处于 PR 草稿分支，业务逻辑与 VCS 模式完全解耦。

## 自动翻译流水线

自动翻译是 `@cat/workflow` 最典型的跨包协作流程，实现了从可翻译元素上传到译文产出的全链路自动化。

```
元素上传 → element:created 事件（@cat/domain）
  ↓
findOrCreateAutoTranslatePROp（@cat/operations）
  ↓  查找或创建专属自动翻译 PR，绑定 Isolation 模式分支
自动翻译 DAG（@cat/workflow）
  ├─→ vectorizeElementOp     — 向量化源文本
  ├─→ recallMemoriesOp       — 翻译记忆三通道召回
  ├─→ recallTermsOp          — 术语匹配
  ├─→ LLM 翻译（携带记忆/术语提示）
  └─→ submitTranslation      — 写入 Isolation 分支 Changeset（@cat/vcs）
        ↓
      PR 变更集（草稿状态）
        ↓  前端 readWithOverlay
      编辑器 Ghost Text — 译者可直接接受或覆盖
```

**幂等性**：同一文档同一目标语言始终只维护一个自动翻译 PR，元素变更时在已有 PR 分支追加 Changeset 而非新建 PR。

**事件驱动**：工作流监听 `element:created` / `element:updated` 事件（`@cat/core` EventBus）自动触发，无需人工干预。

**质量门控**：翻译完成后自动运行 `runQACheckOp`；若存在严重问题（如术语不一致），PR 状态标记为需人工审核。

## 相关主题

- [`domain/core`](../domain/domain--core.zh.md)
