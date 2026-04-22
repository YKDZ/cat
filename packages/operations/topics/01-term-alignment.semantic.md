---
subject: infra/operations
title: 术语对齐
---

`@/workspaces/cat/packages/operations/src/vector-term-align.ts:L55-L205` 负责第一阶段"跨语言候选向量对齐"：先把 `text + definition` 组合成 `vectorText`，再通过 `createVectorizedStringOp` 落到正式 `TranslatableString` / chunk 存储，随后在内存中计算跨语言余弦相似度。

`@/workspaces/cat/packages/operations/src/statistical-term-align.ts:L138-L258` 负责第二阶段"共现对齐"：优先利用 translationId 级共现，缺失时退回 elementId 级共现，并用 `nlpBatchSegmentOp` 补齐翻译侧 lemma 匹配。

`@/workspaces/cat/packages/operations/src/llm-term-align.ts:L136-L256` 是兜底判定层，仅处理前两步没有高置信度结论的 pair；批量 prompt 里会同时带上 term text、POS、definition。

`@/workspaces/cat/packages/operations/src/merge-alignment.ts:L167-L432` 最终把 vector / statistical / llm 三路结果加权融合，再用 Union-Find 做传递闭包，输出多语言术语组并处理"同语言多候选"冲突。`mergeTermAlignment` 是对外暴露的聚合入口。
