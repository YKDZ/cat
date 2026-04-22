---
subject: infra/operations
title: 记忆回归与模板适配
---

`@/workspaces/cat/packages/operations/src/collect-memory-recall.ts:L60-L356` 按通道顺序执行 exact → trgm → variant → semantic 四路回归，以及按 `memoryItem.id` 全局去重、evidence 合并、最高置信保留的规则。`collectMemoryRecallOp` 是对外接口。

`@/workspaces/cat/packages/operations/src/build-memory-recall-variants.ts:L56-L225` 说明 SOURCE 侧 variant 比术语更多：除了 SURFACE / CASE_FOLDED / LEMMA，还有 `TOKEN_TEMPLATE` 与 `FRAGMENT`，从而覆盖模板化记忆的召回场景。

`@/workspaces/cat/packages/operations/src/memory-template.ts:L55-L196` 解释 placeholderization / fillTemplate 如何做变量、数字、链接等 slot 替换，从而实现模板记忆的 translation adaptation。

`@/workspaces/cat/packages/operations/src/search-memory.ts:L57-L162` 说明 semantic channel 的 chunk-range 检索如何和 exact/trgm/variant 聚合到一起。

`@/workspaces/cat/packages/operations/src/memory-recall-regression.test.ts:L65-L139` 提供 fixture regression gate，确保 memory recall 各通道的命中行为不发生静默退化。
