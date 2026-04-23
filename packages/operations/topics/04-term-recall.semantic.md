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
| 8    | **Model Reranker**                     | 在 Ambiguity Gate 打开的 `eligibleBand` 内调用 `RERANK_PROVIDER` 插件进行模型重排；fail-closed，band 外候选顺序不变 |

Pipeline 结果中，Tier-1 clear winner（无 recoverable-conflict）顶部时，Tier-3 候选会被 `suppressTier3IfClearTier1Winner` 静默压制，防止单路径噪声干扰最终展示。

---

## Model Reranker（模型重排层）

`applyModelReranker`（[model-reranker.ts](../src/precision/model-reranker.ts)）在 Ambiguity Gate 完成评估后介入，对 `eligibleBand` 内的候选发起模型重排。整个流程 **fail-closed**：任何失败路径均回退到确定性顺序，不破坏已有精排结果。

### 跳过条件

- `envelope.shouldInvokeModel === false`：Ambiguity Gate 未触发，直接跳过并追加 `model-reranker-skipped` 决策记录。
- `rerankMode === "baseline"`：显式设置为 baseline 模式（供 eval 对比用），即使 Gate 触发也跳过。

### Orchestrator 流程

`orchestrateRerank`（[orchestrator.ts](../src/rerank/orchestrator.ts)）负责 provider 解析、调用与响应校验：

1. **Provider 解析**：通过 `resolvePluginManager` + `firstOrGivenService("RERANK_PROVIDER", rerankProviderId)` 查找服务实例；若无实例则立即返回 `unavailable` trace。
2. **归一化**：`normalizePrecisionCandidates` 将 band 内候选转为 `RerankCandidateDocument`，term 填写 `title`/`sourceText`/`targetText`/`definitionText`，memory 填写 `title`/`sourceText`/`targetText`。
3. **调用 provider**：`provider.service.rerank({ request, signal })` 同时受 `rerankTimeoutMs`（默认 3000 ms）和外部 `AbortSignal` 双重约束。
4. **校验响应**：`validateScoreCoverage` 验证 candidateId 一一对应、无重复、分数为有限数值；校验失败返回 `invalid-response`。
5. **排序**：校验通过后按 `score` 降序排列 candidateId，交由 `applyBandOrder` 仅写回 `[eligibleBand.start, eligibleBand.end)` 区间；前缀与尾部候选原样保留。

### Fail-Closed Outcomes

| Outcome            | 触发条件                               | 排序行为   |
| ------------------ | -------------------------------------- | ---------- |
| `unavailable`      | 无 RERANK_PROVIDER 实例                | 确定性顺序 |
| `cancelled`        | `signal.aborted === true`              | 确定性顺序 |
| `timeout`          | 错误消息含 "timeout" 关键字            | 确定性顺序 |
| `fail-closed`      | 其他异常                               | 确定性顺序 |
| `invalid-response` | candidateId 不全 / 重复 / 非有限数值   | 确定性顺序 |

每个候选都会收到对应的 `rankingDecisions` 条目（`model-reranker-applied`、`model-reranker-skipped`、`model-reranker-unavailable` 等），供 eval `decision-note` scorer 和内部 trace 消费。

### RERANK_PROVIDER 插件

`RERANK_PROVIDER` 是插件系统新增的服务类型（与 `LLM_PROVIDER`、`TEXT_VECTORIZER` 等并列）。首个实现 `@cat-plugin/tei-rerank-provider` 适配 HuggingFace TEI `/rerank` 端点：

- **请求**：`POST /rerank`，body `{ query, texts, raw_scores: false }`，`texts` 为 band 内候选的 `sourceText` 列表。
- **响应解析**：`results[*].{ index, relevance_score }` 通过 `index` 回映到稳定的 `candidateId`。
- **超时与取消**：合并 `AbortSignal.timeout(timeoutMs)` 与调用方 `signal`，超时 → `timeout`，取消 → `cancelled`。
- **Provider metadata**（`providerId`、`modelId`、`endpoint`、`latencyMs`）仅记录在内部 trace，**不进入**面向用户的 recall API 响应。

---

## Context-Route 重排（rerankTermRecallOp）

`rerankTermRecallOp`（[recall-context-rerank.ts](../src/recall-context-rerank.ts)）在路由层（`findTerm`）对 `termRecallOp` 的结果做一次可选的上下文感知重排。不依赖 Ambiguity Gate，而是使用**邻近元素信号**独立决定是否打开 band。

### 上下文信号采集

`loadNeighborContext` 查询当前元素前后各 `MAX_CONTEXT_WINDOW`（= 3）个邻近元素，提取：

- `neighborSources`：邻近元素的原文
- `neighborTranslations`：邻近元素已审批的译文（过滤 null 值）

若加载失败（任何异常），直接返回原始 `terms` 顺序（**fail-closed**）。

### Context Band Selector

`selectContextBand`（[context-band-selector.ts](../src/rerank/context-band-selector.ts)）决定重排范围：

1. 锚定 `ranked[0]`（置信度最高的候选）。
2. 依次评估后续候选：只要与 anchor 的置信度差 ≤ 0.08 **且**候选有至少一项正向上下文信号，就纳入 band。
3. band 成员 < 2 时返回 `null`，不触发重排。

| 信号             | 参考文本                              | 评估候选字段                      |
| ---------------- | ------------------------------------- | --------------------------------- |
| `sourceOverlap`  | `[queryText, ...neighborSources]`     | `matchedText` 或 `term`           |
| `targetOverlap`  | `neighborTranslations`（已审批译文）  | `translation`                     |
| `conceptOverlap` | `[queryText]`                         | concept 定义 + subject 名称与定义 |

### 调用共享 Orchestrator

band 打开后，将 band 内术语归一化（含 `contextText`：concept 定义 + subject 信息）并调用 `orchestrateRerank`（trigger: `"context-route"`），传入 `contextHints.neighborSources` 与 `contextHints.approvedNeighborTranslations` 供 provider 参考。

- 仅重排 band 内候选顺序，**原始 `confidence` 值不变**，band 外（尾部）位置也不变。
- provider 不可用或重排失败时，返回原始 `terms`（fail-closed）。

---

## 回归测试

`term-recall-regression.test.ts`（[源码](../src/term-recall-regression.test.ts)）通过 fixture 驱动的回归门，在 vitest 中对三条通道的命中行为做快照断言，防止静默退化。测试用例覆盖：词汇通道的子串命中、形态通道跨词形变化命中、语义通道跨义近义词命中，以及 Precision Pipeline 层的精排行为（Tier 分配、entity-short-query 保护、跨话题冲突抑制）。
