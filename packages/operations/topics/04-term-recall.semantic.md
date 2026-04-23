---
subject: infra/operations
title: 术语回归与重排
---

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

## Precision Pipeline（精排层）

`collectTermRecallOp` 收集原始多路结果后，由 `runPrecisionPipeline`（[precision-pipeline.ts](../src/precision/precision-pipeline.ts)）对候选进行精排。Pipeline 按顺序执行以下步骤：

| 步骤 | 组件                                   | 作用                                                                                |
| ---- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| 1    | **QueryProfiler**                      | 提取查询特征（tokenCount、contentWordDensity、hasNumericAnchor、isTemplateLike 等） |
| 2    | **Fusion Ledger**                      | 将多路原始结果按 conceptId 合并为候选，融合 evidence 列表                           |
| 3    | **Budget Gate**                        | 分配 `reserved`（Tier-1 候选）/ `competitive` 预算槽位                              |
| 4    | **Taxonomy Registry + Topic Resolver** | 将 term subjects 映射到规范话题，推断 QueryTopicHypothesis                          |
| 5    | **Scope & Anchor Guard**               | 范围过滤、话题冲突检测、数字锚点校验；发出 hard-filter 或 recoverable-demotion      |
| 6    | **Deterministic Layered Ranker**       | 三级桶分级（Tier 1 精确命中、Tier 2 多证据共识、Tier 3 单路径或未知话题）           |
| 7    | **Ambiguity Gate**                     | 四条规则评估是否需要模型重排；Clear Tier-1 winner 不进入 model band                 |
| 8    | **Model Reranker stub**                | 当前无操作存根；Ambiguity Gate 触发时保留重排入口                                   |

Pipeline 结果中，Tier-1 clear winner（无 recoverable-conflict）顶部时，Tier-3 候选会被 `suppressTier3IfClearTier1Winner` 静默压制，防止单路径噪声干扰最终展示。

---

## 回归测试

`term-recall-regression.test.ts`（[源码](../src/term-recall-regression.test.ts)）通过 fixture 驱动的回归门，在 vitest 中对三条通道的命中行为做快照断言，防止静默退化。测试用例覆盖：词汇通道的子串命中、形态通道跨词形变化命中、语义通道跨义近义词命中，以及 Precision Pipeline 层的精排行为（Tier 分配、entity-short-query 保护、跨话题冲突抑制）。
