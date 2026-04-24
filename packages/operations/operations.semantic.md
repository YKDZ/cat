---
subject: infra/operations
---

`@cat/operations` 是 CAT 后端的业务流程编排层，位于 API 路由与领域模型（`@cat/domain`）之间，将复杂的多步骤操作封装为单一函数，避免业务逻辑泄漏到路由处理器中。

## 设计原则

每个 Operation 函数：

1. 接受经过验证的输入（由 API 层通过 Zod Schema 校验）。
2. 调用一条或多条 `Command`/`Query`，并在必要时组合多个聚合。
3. 协调外部服务（向量化、LLM、缓存）以完成完整的业务语义。
4. 将 `DomainEvent` 转发至 `DomainEventBus`（由命令执行结果中的 `events` 列表驱动）。

## 主要能力分区

**术语与记忆**：`createTermOp`（新建术语条目并触发向量化）、`termRecallOp`（词汇、形态、语义多路术语召回）、`collectMemoryRecallOp`（精确 / trigram / variant / bm25 / 语义五条候选通道的翻译记忆召回，随后再追加 `sparse` 启发式证据）。

**自动翻译**：`fetchBestTranslationCandidateOp`（并行查询 advisor 与记忆，选取最优候选）、`runAutoTranslatePipeline`（批量预翻译流水线，写入 AUTO_TRANSLATE PR changeset）。

**质量检查与 NLP**：`qaTranslationOp`（完整 QA 管线：tokenize → QA_CHECKER 插件 → 持久化结果）、`tokenizeOp`（调度所有 TOKENIZER 服务，按 priority 顺序执行）。

## VCS 透明化

Operations 层通过 `executeWithVCS(fn, vcsContext)` 包装器（来自 `@cat/workflow`）透明地将写操作路由到正确的 VCS 分支。调用方无需感知底层是 Direct 模式（直写主线）还是 Isolation 模式（写入草稿分支），从而保持接口的简洁一致。
