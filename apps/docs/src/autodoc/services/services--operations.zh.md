# 操作与任务系统

> **Section**: 服务  ·  **Subject ID**: `services/operations`

`@cat/operations` 是 CAT 后端的业务流程编排层，位于 API 路由与领域模型（`@cat/domain`）之间，将复杂的多步骤操作封装为单一函数，避免业务逻辑泄漏到路由处理器中。

## 设计原则

每个 Operation 函数：

1. 接受经过验证的输入（由 API 层通过 Zod Schema 校验）。
2. 调用一条或多条 `Command`/`Query`，并在必要时组合多个聚合。
3. 协调外部服务（向量化、LLM、缓存）以完成完整的业务语义。
4. 将 `DomainEvent` 转发至 `DomainEventBus`（由命令执行结果中的 `events` 列表驱动）。

## 主要能力分区

**自动翻译操作**：`autoTranslateElementOp` 触发 NLP 向量化 → 记忆召回 → 术语匹配 → LLM 翻译的完整链路；`findOrCreateAutoTranslatePROp` 查找或新建专属自动翻译 PR，确保幂等。

**NLP / 向量化 Pipeline**：`vectorizeElementOp` 将元素文本嵌入，写入向量数据库；`recallMemoriesOp`（翻译记忆召回）与 `recallTermsOp`（术语匹配）基于向量相似度与关键字双通道搜索返回最佳候选。

**记忆与术语**：`addTMRecordOp`（翻译记忆入库）、`addTermOp`（术语条目添加）、`searchTMOp`（精确 + trigram + 语义三通道搜索）。

**PR / VCS 工作流**：`createPROp`（创建 PR）、`mergePROp`（合并 PR，触发 Changeset 应用）、`createBranchOp`（创建隔离分支）、`applyChangesetOp`（将草稿变更集写入主线）。

**质量检查**：`runQACheckOp` 对译文执行一致性、术语合规、长度比率等规则检查，聚合为 `QAReport`。

## VCS 透明化

Operations 层通过 `executeWithVCS(fn, vcsContext)` 包装器（来自 `@cat/workflow`）透明地将写操作路由到正确的 VCS 分支。调用方无需感知底层是 Direct 模式（直写主线）还是 Isolation 模式（写入草稿分支），从而保持接口的简洁一致。

## 相关主题

- [`domain/core`](../domain/domain--core.zh.md)
