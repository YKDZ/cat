---
subject: infra/operations
title: 自动翻译候选选择
---

`@/workspaces/cat/packages/operations/src/fetch-best-translation-candidate.ts:L38-L104` 是最小候选选择器：并行跑 `fetchAdviseOp` 和 `collectMemoryRecallOp`，memory 优先于 advisor。`fetchBestTranslationCandidateOp` 是对外接口。

`@/workspaces/cat/packages/operations/src/fetch-advise.ts:L75-L182` 负责把术语、记忆、element metadata 一起打包给 `TRANSLATION_ADVISOR` 插件。

`@/workspaces/cat/packages/operations/src/auto-translate.ts:L40-L114` 只做"选候选 + createTranslationOp"这件事；它不是 PR pipeline，仅处理单条元素的候选落库。

`@/workspaces/cat/packages/operations/src/run-auto-translate-pipeline.ts:L24-L138` 才是批量预翻译流水线：检查项目开关、挑选目标语言、查找或创建 AUTO_TRANSLATE PR，然后把候选写成 `auto_translation` changeset entry。

`@/workspaces/cat/packages/operations/src/__tests__/run-auto-translate-pipeline.test.ts:L145-L366` 涵盖 gate logic / language selection / changeset persistence 的集成测试，确保流水线行为可回归。
