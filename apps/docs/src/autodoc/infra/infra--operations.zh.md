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

## 整体流程

`termRecallOp`（[term-recall.ts](../src/term-recall.ts)）是对外暴露的顶层接口。它先调用 `collectTermRecallOp` 汇聚三路检索结果，再通过 `listConceptSubjectsByConceptIds` 批量拉取每个命中 concept 的主题列表和定义，拼装成 `EnrichedTermMatch` 返回。

`collectTermRecallOp`（[collect-term-recall.ts](../src/collect-term-recall.ts)）负责并发发起三个子任务，收集各路 `LookedUpTerm[]`，通过 `mergeTermMatches` 按 `conceptId` 去重合并，按置信度和术语长度降序排列，取前 `maxAmount`（默认 20）条。

---

## 通道 1：Lexical（词汇匹配）

**实现**：`listLexicalTermSuggestions`（Domain 查询）  
**输入**：原始 `text`（不做 NLP 预处理）  
**机制**：通过 PostgreSQL `pg_trgm` 的 `word_similarity` 函数对术语的 source term 文本进行模糊匹配，按字面字符串相似度评分。  
**阈值**：`wordSimilarityThreshold`（默认 0.3），容忍度较低，能命中大量前缀/子串变体。  
**特点**：无需 NLP，始终并发执行，是三路中最快的通道，作为基础兜底层。

---

## 通道 2：Morphological（形态匹配）

**实现**：`listMorphologicalTermSuggestions`（Domain 查询）  
**输入**：经 NLP 归一化的 `normalizedText`（content token 的 lemma 拼接串）  
**预处理**：`normalizeRecallQuery` 先用 `nlpSegmentOp` 对 `text` 分词，过滤掉停用词（`isStop`）和标点（`isPunct`），再用 `joinLemmas` 将剩余 content token 的 lemma 拼接为归一化字符串。如果 NLP 后没有 content token，则 fallback 到 `text.toLowerCase()`。  
**机制**：将 `normalizedText` 与预先构建的 LEMMA 型 variant 做 pg_trgm 相似度匹配（`similarity()`），而不是直接对原始术语文本比较，因此能跨越大小写、词形变化（复数、时态等）命中。  
**阈值**：`minMorphologySimilarity`（默认 0.7），比 lexical 严格，避免形态 noise。  
**跳过条件**：若 NLP 归一化后得到空串，则跳过本通道，节省 DB 调用。

---

## 通道 3：Semantic（语义匹配）

**实现**：`semanticSearchTermsOp`（[semantic-search-terms.ts](../src/semantic-search-terms.ts)）  
**输入**：原始 `text`，需要 `TEXT_VECTORIZER` 与 `VECTOR_STORAGE` 插件均可用  
**机制（五步流水线）**：

1. **构建搜索范围**：通过 `listSemanticTermSearchRange` 找出指定词汇表中所有已向量化（`stringId IS NOT NULL`）的 termConcept，沿 `termConcept.stringId → translatableString → chunk` 链路拿到 `chunkId` 列表，同时建立 `chunkId → conceptId` 反查 map。
2. **实时向量化**：调用 `vectorizer.vectorize` 对 `text` 生成 query vector（可能产出多个 sub-chunk vector）。
3. **向量相似度检索**：调用 `vectorStorage.cosineSimilarity`，在第 1 步划定的 chunkId range 内做余弦相似度检索，过滤 `minSimilarity`（默认 0.6）以下的结果。
4. **chunk → concept 回映**：遍历相似度结果，通过 `chunkToConceptMap` 解析 conceptId，对同一 concept 保留最高相似度。
5. **批量拉取术语对**：调用 `fetchTermsByConceptIds`，按 source + translation language 拉取完整术语对，并将余弦相似度作为 confidence 写入。

**跳过条件**：若 `vectorizer` 或 `vectorStorage` 插件未启用、向量化结果为空、或搜索范围为空，则返回空数组。

---

## 去重与合并（mergeTermMatches）

三路结果汇总后以 `conceptId` 为 key 合并：

- 同一 concept 的多条记录中，置信度更高者成为"主体"，另一条的 evidences 被合并进去（按 `channel + matchedText + variantType + note` 的五元组去重）。
- 最终 `confidence` 取两者最大值，`matchedText` 如为 null 则从另一条补全。
- 全量排序：先按 `confidence` 降序，再按 `term.length` 降序（更长的术语优先）。

---

## Variant 构建（buildTermRecallVariantsOp）

`buildTermRecallVariantsOp`（[build-term-recall-variants.ts](../src/build-term-recall-variants.ts)）在术语入库或更新时预计算并持久化 recall variant，供 morphological 通道检索使用。每个 concept 按语言分组处理：

| Variant 类型    | 生成规则                                                                                                             | 去重依据                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `SURFACE`       | 原始术语文本（`trimmed`）                                                                                            | `(SURFACE, trimmed)`        |
| `CASE_FOLDED`   | `trimmed.toLowerCase()`，与原文相同则跳过                                                                            | `(CASE_FOLDED, lowercased)` |
| `LEMMA`         | NLP content token 的 lemma 拼接串；与 SURFACE/CASE_FOLDED 重复时跳过                                                 | `(LEMMA, lemmaText)`        |
| `LEMMA`（窗口） | 多词术语额外生成大小 2–6 的 content token 滑动窗口，每个窗口单独存一条 LEMMA variant，`meta.windowSize` 记录窗口大小 | `(LEMMA, windowNormalized)` |

全部 variant 按 `(variantType, normalizedText)` 去重后，通过 `replaceTermRecallVariants` 全量替换，实现幂等更新。

---

## 回归测试

`term-recall-regression.test.ts`（[源码](../src/term-recall-regression.test.ts)）通过 fixture 驱动的回归门，在 vitest 中对三条通道的命中行为做快照断言，防止静默退化。测试用例覆盖：词汇通道的子串命中、形态通道跨词形变化命中、语义通道跨义近义词命中。

## 记忆回归与模板适配

## 整体流程

`collectMemoryRecallOp`（[collect-memory-recall.ts](../src/collect-memory-recall.ts)）是对外接口，顺序执行四条回归通道，并维护一个以 `memoryItemId` 为 key 的全局 `seen` Map，实现跨通道去重与 evidence 合并，最终按置信度降序返回。

每条通道的结果都通过 `pushResult` 写入 `seen`：若该 id 已存在，则合并 evidences（按五元组 key 去重）并保留最高置信度；若不存在则直接插入。对于有 TOKEN_TEMPLATE 的命中条目，还会触发模板适配尝试。

**归一化预处理**：`normalizedText` 优先从调用方传入，否则从 `sourceNlpTokens` 中过滤掉停用词和标点后拼接 lemma（通过 `joinLemmas`），若两者均无则 fallback 到 `text.toLowerCase()`。

---

## 通道 1：Exact（精确匹配）

**实现**：`listExactMemorySuggestions`（Domain 查询）  
**输入**：原始 `text`  
**机制**：对记忆库中的 source 文本做精确字符串等值查询，匹配置信度固定为 1.0。  
**特点**：最快、最确定，是四路中优先级最高的通道。执行失败时会 `logger.error` 记录但不阻塞后续通道。

---

## 通道 2：trgm（三元组相似度匹配）

**实现**：`listTrgmMemorySuggestions`（Domain 查询）  
**输入**：原始 `text`  
**机制**：使用 PostgreSQL `pg_trgm` 的字符串相似度函数（`similarity()`）对 source 文本做全文三元组匹配，返回相似度作为 confidence。  
**阈值**：`minSimilarity`（默认 0.72），比变体通道略宽，容忍小幅字符差异（错别字、标点变化等）。  
**特点**：无需 NLP，能捕捉近似字面相似的记忆条目，是对 exact 的自然延伸。

---

## 通道 3：Variant（变体匹配）

**实现**：`listVariantMemorySuggestions`（Domain 查询）  
**输入**：原始 `text` + 归一化后的 `normalizedText`  
**机制**：对记忆库中预构建的 SOURCE 侧 variant 进行匹配，variant 涵盖以下类型：

| Variant 类型     | 匹配目标                   | 典型场景                 |
| ---------------- | -------------------------- | ------------------------ |
| `SURFACE`        | 原始文本精确匹配           | 精确重复句               |
| `CASE_FOLDED`    | 小写后的 `normalizedText`  | 大小写差异               |
| `LEMMA`          | lemma 拼接串（内容词词根） | 词形变化（时态、复数）   |
| `TOKEN_TEMPLATE` | 占位符模板字符串           | 含变量/数字/链接的模板句 |
| `FRAGMENT`       | 去停用词后的内容词原文拼接 | 局部句段或短语匹配       |

**阈值**：`minVariantSimilarity`（默认 0.7），对 `normalizedText` 与 variant 的 `normalizedText` 字段做相似度评分。  
**特点**：依赖 `buildMemoryRecallVariantsOp` 的预计算结果，能跨词形、模板、片段匹配，覆盖 exact/trgm 的盲区。

---

## 通道 4：Semantic（向量语义匹配）

**实现**：`searchMemoryOp`（[search-memory.ts](../src/search-memory.ts)）  
**依赖**：`VECTOR_STORAGE` 插件（必须）；`TEXT_VECTORIZER` 插件（仅在未直接传入 `queryVectors` 时需要）  
**触发条件**：满足以下任意一条：`chunkIds` 非空、`queryVectors` 非空、或同时有 `vectorStorage` 与 `vectorizer`。

**机制（三步流水线）**：

1. **获取搜索范围**：`getSearchMemoryChunkRange` 查出指定记忆库中所有已向量化的 source chunk，以 `chunkId` 数组作为检索范围，避免跨库污染。
2. **向量相似度检索**：调用 `searchChunkOp`，支持两种查询模式——`queryChunkIds`（从 DB 查已存储 embedding）和 `queryVectors`（调用方直传原始向量，跳过 DB 查询）。内部再调用 `vectorStorage.cosineSimilarity` 在限定范围内排名。
3. **chunkId → 记忆条目回映**：`listMemorySuggestionsByChunkIds` 把相似 chunk 的余弦相似度作为 confidence，拼回完整的 `MemorySuggestion`（含 source、translation、memoryId 等），按 confidence 降序排列。

每条语义命中都会追加 `channel: "semantic"` 的 evidence，note 固定为 `"vector semantic match"`。

---

## 模板适配（tryAdapt）

当一条 variant/trgm 命中的记忆条目带有 `sourceTemplate` 与 `translationTemplate` 时，`tryAdapt` 会尝试把当前输入文本的 slot 值"填入"翻译模板，生成语境适配的译文。流程如下：

1. **惰性计算当前源模板**：通过 `ensureCurrentSourceTemplate` 对当前 `text` 调用 `tokenizeOp` + `placeholderize`，将 `number`、`variable`、`link`、`term`、`mask` 等非文本 token 替换为 `{NUM_0}` / `{VAR_0}` / `{LINK_0}` 等占位符，得到 `currentSourceTemplate` 及 `slots`（占位符 → 原始值映射）。
2. **模板兼容性检查**：若 `currentSourceTemplate` 与存储的 `sourceTemplate` 不同（即结构不同），直接跳过适配，返回原始建议。
3. **翻译槽填充**：从 `slotMapping` 中过滤 `tgt:` 前缀的槽，转为 `translationSlots`。再调用 `fillTemplate`：遍历 `translationTemplate` 中所有占位符，优先用当前源文本的对应值替换，无对应时 fallback 到存储值，若仍无法解析则返回 `null`（不适配）。
4. **结果写回**：适配成功时，在 `MemorySuggestion` 上补充 `adaptedTranslation` 与 `adaptationMethod: "token-replaced"`。

---

## Variant 构建（buildMemoryRecallVariantsOp）

`buildMemoryRecallVariantsOp`（[build-memory-recall-variants.ts](../src/build-memory-recall-variants.ts)）在记忆条目入库或更新时预计算 variant，为通道 3 提供索引。

**SOURCE 侧**（最多 5 种类型）：

| Variant 类型     | 生成规则                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `SURFACE`        | 原始 source 文本                                                                                 |
| `CASE_FOLDED`    | 全小写，与原文相同则跳过                                                                         |
| `LEMMA`          | NLP content token lemma 拼接串；与前两者重复则跳过                                               |
| `FRAGMENT`       | NLP content token 原文（非 lemma）小写拼接；与 CASE_FOLDED / LEMMA 重复则跳过                    |
| `TOKEN_TEMPLATE` | 调用 `tokenizeOp` + `placeholderize`，得到含占位符的模板字符串；与原文相同或 tokenize 失败则跳过 |
| `LEMMA`（窗口）  | 多词句子额外生成大小 2–6 的 content token 滑动窗口，每个窗口一条 LEMMA variant                   |

**TRANSLATION 侧**（仅 SURFACE + CASE_FOLDED，不做 NLP/模板处理）。

全部 variant 按 `(variantType, normalizedText)` 去重，通过 `replaceMemoryRecallVariants` 按 `querySide` 分别全量替换，实现幂等。

---

## 回归测试

`memory-recall-regression.test.ts`（[源码](../src/memory-recall-regression.test.ts)）通过 fixture 回归门验证四条通道各自的命中行为不发生静默退化。测试场景包括：exact 精确命中、trgm 近似命中、variant 词形变化命中、TOKEN_TEMPLATE 模板适配正确性。

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
