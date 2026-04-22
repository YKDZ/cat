# 操作与任务系统

> **Section**: 基础设施  ·  **Subject ID**: `infra/operations`

`@cat/operations` 是 CAT 后端的业务流程编排层，位于 API 路由与领域模型（`@cat/domain`）之间，将复杂的多步骤操作封装为单一函数，避免业务逻辑泄漏到路由处理器中。

## 设计原则

每个 Operation 函数：

1. 接受经过验证的输入（由 API 层通过 Zod Schema 校验）。
2. 调用一条或多条 `Command`/`Query`，并在必要时组合多个聚合。
3. 协调外部服务（向量化、LLM、缓存）以完成完整的业务语义。
4. 将 `DomainEvent` 转发至 `DomainEventBus`（由命令执行结果中的 `events` 列表驱动）。

## 主要能力分区

**术语与记忆**：`createTermOp`（新建术语条目并触发向量化）、`termRecallOp`（词汇/形态/语义三通道术语召回）、`collectMemoryRecallOp`（精确/trigram/variant/语义四通道翻译记忆召回）。

**自动翻译**：`fetchBestTranslationCandidateOp`（并行查询 advisor 与记忆，选取最优候选）、`runAutoTranslatePipeline`（批量预翻译流水线，写入 AUTO_TRANSLATE PR changeset）。

**质量检查与 NLP**：`qaTranslationOp`（完整 QA 管线：tokenize → QA_CHECKER 插件 → 持久化结果）、`tokenizeOp`（调度所有 TOKENIZER 服务，按 priority 顺序执行）。

## VCS 透明化

Operations 层通过 `executeWithVCS(fn, vcsContext)` 包装器（来自 `@cat/workflow`）透明地将写操作路由到正确的 VCS 分支。调用方无需感知底层是 Direct 模式（直写主线）还是 Isolation 模式（写入草稿分支），从而保持接口的简洁一致。

## 术语对齐

`@/workspaces/cat/packages/operations/src/vector-term-align.ts:L55-L205` 负责第一阶段"跨语言候选向量对齐"：先把 `text + definition` 组合成 `vectorText`，再通过 `createVectorizedStringOp` 落到正式 `TranslatableString` / chunk 存储，随后在内存中计算跨语言余弦相似度。

`@/workspaces/cat/packages/operations/src/statistical-term-align.ts:L138-L258` 负责第二阶段"共现对齐"：优先利用 translationId 级共现，缺失时退回 elementId 级共现，并用 `nlpBatchSegmentOp` 补齐翻译侧 lemma 匹配。

`@/workspaces/cat/packages/operations/src/llm-term-align.ts:L136-L256` 是兜底判定层，仅处理前两步没有高置信度结论的 pair；批量 prompt 里会同时带上 term text、POS、definition。

`@/workspaces/cat/packages/operations/src/merge-alignment.ts:L167-L432` 最终把 vector / statistical / llm 三路结果加权融合，再用 Union-Find 做传递闭包，输出多语言术语组并处理"同语言多候选"冲突。`mergeTermAlignment` 是对外暴露的聚合入口。

## 术语发现

`@/workspaces/cat/packages/operations/src/statistical-term-extract.ts:L158-L351` 是候选生成入口：先 `nlpBatchSegmentOp`，再执行 POS 过滤、N-gram 枚举、TF-IDF 与 C-value 评分。

`@/workspaces/cat/packages/operations/src/deduplicate-match-terms.ts:L58-L148` 负责把候选按 `normalizedText` 去重，并批量回查现有 glossary，标记哪些候选已经存在。`deduplicateMatchTermsOp` 是该步骤的对外接口。

`@/workspaces/cat/packages/operations/src/llm-term-enhance.ts:L179-L431` 只在统计候选之后运行：高置信候选补 definition / subjects，低置信候选交给 LLM 做保留/剔除判定。

术语发现不是"LLM 直接抽词"，而是"统计提名 → glossary 去重 → LLM 校验补全"的三段式管线。

## 术语存储与“种属差”向量化

`@/workspaces/cat/packages/domain/src/queries/glossary/fetch-terms-by-concept-ids.query.ts:L132-L220` 的 `buildConceptVectorizationText` 不直接向量化术语 surface form，而是把 `Terms + Subjects + Definition` 拼成结构化文本；这正是"种属差"机制——通过上位概念与定义的组合文本区分同形异义术语。

`@/workspaces/cat/packages/operations/src/create-vectorized-string.ts:L50-L100` 只负责创建 `PENDING_VECTORIZE` string 并在服务齐全时异步入队，不在调用点内阻塞等待 embedding。

`@/workspaces/cat/packages/operations/src/revectorize-concept.ts:L33-L107` 负责比较旧文本与新文本；结构化文本没变就 skip，变了才创建新 string 并回写 `termConcept.stringId`。

`@/workspaces/cat/packages/operations/src/create-term.ts:L25-L67` 与 `@/workspaces/cat/packages/operations/src/add-term-to-concept.ts:L31-L63` 分别处理两种路径：新建 concept 时立即 revectorize；给已有 concept 加 term 时依赖领域事件后续触发 revectorize。

## 术语回归与重排

`@/workspaces/cat/packages/operations/src/collect-term-recall.ts:L96-L159` 是聚合入口，同时发起 lexical、morphological、semantic 三路检索，再按 conceptId 合并 evidence。`termRecallOp` 是对外暴露的顶层接口。

`@/workspaces/cat/packages/operations/src/build-term-recall-variants.ts:L27-L162` 解释 recall variant 是怎样从 SURFACE / CASE_FOLDED / LEMMA / multi-word windows 生成的。

`@/workspaces/cat/packages/operations/src/semantic-search-terms.ts:L33-L148` 解释 semantic channel 如何把 query text 向量化，再把 chunkId 命中回映到 conceptId。

`@/workspaces/cat/packages/operations/src/term-recall.ts:L31-L102` 说明 enrich 阶段如何把 concept subjects / definitions 拼回返回值。

`@/workspaces/cat/packages/operations/src/term-recall-regression.test.ts:L54-L115` 提供 fixture-driven regression gate，确保词汇、形态、语义三通道的召回结果不发生静默退化。

## 记忆回归与模板适配

`@/workspaces/cat/packages/operations/src/collect-memory-recall.ts:L60-L356` 按通道顺序执行 exact → trgm → variant → semantic 四路回归，以及按 `memoryItem.id` 全局去重、evidence 合并、最高置信保留的规则。`collectMemoryRecallOp` 是对外接口。

`@/workspaces/cat/packages/operations/src/build-memory-recall-variants.ts:L56-L225` 说明 SOURCE 侧 variant 比术语更多：除了 SURFACE / CASE_FOLDED / LEMMA，还有 `TOKEN_TEMPLATE` 与 `FRAGMENT`，从而覆盖模板化记忆的召回场景。

`@/workspaces/cat/packages/operations/src/memory-template.ts:L55-L196` 解释 placeholderization / fillTemplate 如何做变量、数字、链接等 slot 替换，从而实现模板记忆的 translation adaptation。

`@/workspaces/cat/packages/operations/src/search-memory.ts:L57-L162` 说明 semantic channel 的 chunk-range 检索如何和 exact/trgm/variant 聚合到一起。

`@/workspaces/cat/packages/operations/src/memory-recall-regression.test.ts:L65-L139` 提供 fixture regression gate，确保 memory recall 各通道的命中行为不发生静默退化。

## 自动翻译候选选择

`@/workspaces/cat/packages/operations/src/fetch-best-translation-candidate.ts:L38-L104` 是最小候选选择器：并行跑 `fetchAdviseOp` 和 `collectMemoryRecallOp`，memory 优先于 advisor。`fetchBestTranslationCandidateOp` 是对外接口。

`@/workspaces/cat/packages/operations/src/fetch-advise.ts:L75-L182` 负责把术语、记忆、element metadata 一起打包给 `TRANSLATION_ADVISOR` 插件。

`@/workspaces/cat/packages/operations/src/auto-translate.ts:L40-L114` 只做"选候选 + createTranslationOp"这件事；它不是 PR pipeline，仅处理单条元素的候选落库。

`@/workspaces/cat/packages/operations/src/run-auto-translate-pipeline.ts:L24-L138` 才是批量预翻译流水线：检查项目开关、挑选目标语言、查找或创建 AUTO_TRANSLATE PR，然后把候选写成 `auto_translation` changeset entry。

`@/workspaces/cat/packages/operations/src/__tests__/run-auto-translate-pipeline.test.ts:L145-L366` 涵盖 gate logic / language selection / changeset persistence 的集成测试，确保流水线行为可回归。

## Tokenizer 系统

`@/workspaces/cat/packages/operations/src/tokenize.ts:L23-L56` 只做 orchestration：从 plugin manager 取出所有 `TOKENIZER` 服务，按 priority 排序后调用 `@cat/plugin-core` 的 `tokenize()`。`tokenizeOp` 是对外接口。

`@/workspaces/cat/packages/plugin-core/src/utils/tokenizer.ts:L9-L91` 解释真正的 rule engine：逐 cursor 扫描、首个匹配规则获胜、未命中时回退成普通 `text` token、children token 会递归 shift offset。

`@/workspaces/cat/packages/plugin-core/src/services/tokenizer.ts:L13-L66` 和 `@/workspaces/cat/packages/plugin-core/src/services/nlp-word-segmenter.ts:L45-L90` 需要并列说明"规则 tokenizer"与"NLP word segmenter"的职责差异：前者通过正则/字符串规则切分结构化文本（变量、标点等），后者利用 NLP 模型做语言感知的词语切分。

`@/workspaces/cat/@cat-plugin/basic-tokenizer/src/index.ts:L14-L31` 与 `@/workspaces/cat/@cat-plugin/basic-tokenizer/src/tokenizer.ts:L25-L167` 作为默认实现示例，说明 newline / term / variable / literal / punctuation 的优先级栈。

## QA 系统

`@/workspaces/cat/packages/operations/src/qa-translation.ts:L25-L100` 是完整 QA pipeline：拉上下文、并行 tokenize 源文与译文、执行 `qaOp`、再持久化结果。`qaTranslationOp` 是对外接口。

`@/workspaces/cat/packages/operations/src/qa.ts:L62-L142` 说明 QA 运行时如何收集 glossary terms、flatten token tree、遍历所有 `QA_CHECKER` 插件，并在"无 issue"时写入显式 pass 结果。

`@/workspaces/cat/packages/plugin-core/src/services/qa.ts:L25-L59` 定义插件边界：`QAChecker.check(ctx)` 只消费 tokenized source/translation + matched terms，输出 `QAIssue` 列表。

`@/workspaces/cat/@cat-plugin/basic-qa-checker/src/checker.ts:L7-L94` 提供默认规则示例：数字一致性与变量一致性，演示如何实现一个最小 `QAChecker`。

## 相关主题

- [`domain/core`](../domain/domain--core.zh.md)
