---
subject: infra/operations
title: 术语回归与重排
---

`@/workspaces/cat/packages/operations/src/collect-term-recall.ts:L96-L159` 是聚合入口，同时发起 lexical、morphological、semantic 三路检索，再按 conceptId 合并 evidence。`termRecallOp` 是对外暴露的顶层接口。

`@/workspaces/cat/packages/operations/src/build-term-recall-variants.ts:L27-L162` 解释 recall variant 是怎样从 SURFACE / CASE_FOLDED / LEMMA / multi-word windows 生成的。

`@/workspaces/cat/packages/operations/src/semantic-search-terms.ts:L33-L148` 解释 semantic channel 如何把 query text 向量化，再把 chunkId 命中回映到 conceptId。

`@/workspaces/cat/packages/operations/src/term-recall.ts:L31-L102` 说明 enrich 阶段如何把 concept subjects / definitions 拼回返回值。

`@/workspaces/cat/packages/operations/src/term-recall-regression.test.ts:L54-L115` 提供 fixture-driven regression gate，确保词汇、形态、语义三通道的召回结果不发生静默退化。
