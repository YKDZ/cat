---
subject: infra/operations
title: 术语发现
---

`@/workspaces/cat/packages/operations/src/statistical-term-extract.ts:L158-L351` 是候选生成入口：先 `nlpBatchSegmentOp`，再执行 POS 过滤、N-gram 枚举、TF-IDF 与 C-value 评分。

`@/workspaces/cat/packages/operations/src/deduplicate-match-terms.ts:L58-L148` 负责把候选按 `normalizedText` 去重，并批量回查现有 glossary，标记哪些候选已经存在。`deduplicateMatchTermsOp` 是该步骤的对外接口。

`@/workspaces/cat/packages/operations/src/llm-term-enhance.ts:L179-L431` 只在统计候选之后运行：高置信候选补 definition / subjects，低置信候选交给 LLM 做保留/剔除判定。

术语发现不是"LLM 直接抽词"，而是"统计提名 → glossary 去重 → LLM 校验补全"的三段式管线。
