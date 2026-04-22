---
subject: ai/agent-tools
---

`@cat/agent-tools` 提供 Agent ReAct 循环中可调用的内置工具集，所有工具遵循统一的 `AgentToolDefinition` 接口。

## 接口设计

每个工具声明：

- `name`：唯一标识，对应 LLM 中的函数名。
- `parameters`：Zod Schema，框架自动将其转为 JSON Schema 提供给 LLM。
- `sideEffectType`（`SideEffectType`）：`none`（只读）/ `internal`（内部状态）/ `external`（外部写入）/ `mixed`，用于 Agent 决策是否可以缓存或重试。
- `toolSecurityLevel`（`ToolSecurityLevel`）：`standard` / `privileged` / `administrative`，在 `ToolExecutionContext` 中进行权限校验。
- `execute(args, ctx)`：实际执行逻辑；`ctx` 携带 `session`（会话元数据）、`permissions`（权限检查钩子）、`cost`（token 预算）、`vcsMode` 以及可选的 `pluginManager`。

## 工具分类

**会话工具**：`finish`（结束循环）、`update_scratchpad`（更新工作笔记）、`read_precheck`（读取当前轮次/超时状态）。

**Issue 工具**：`issue_list`（列出项目 Issue）、`issue_create`（创建 Issue）、`issue_claim`（认领 Issue）、`issue_comment`（添加评论）。

**Pull Request 工具**：`pr_create`（创建 PR，可关联 Issue）、`pr_update`（更新标题/描述）、`pr_comment`（添加审查评论）。

**翻译工具**：`search_tm`（翻译记忆搜索，含精确、trigram、语义三通道）、`search_termbase`（术语库搜索）、`get_documents`、`list_elements`、`get_translations`、`get_neighbors`（上下文邻近元素）、`qa_check`（质量检查）、`submit_translation`（提交翻译结果）。

## 注册方式

工具通过 `ToolRegistry.register(tool)` 注册到运行时，`ToolRegistry.toLLMTools(names)` 将指定工具列表序列化为 LLM 可消费的 JSON Schema 格式。Agent 定义文件的 frontmatter 中声明 `tools` 列表，Reasoning 节点按需传入 LLM。
