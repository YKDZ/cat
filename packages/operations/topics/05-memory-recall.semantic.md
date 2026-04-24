---
subject: infra/operations
title: 记忆回归与模板适配
---

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

## Precision Pipeline（精排层）

`collectMemoryRecallOp` 收集原始多路结果后，由 `runPrecisionPipeline`（[precision-pipeline.ts](../src/precision/precision-pipeline.ts)）对候选进行精排。流程与 term 侧完全共享同一 Pipeline Orchestrator，步骤见 04-term-recall.semantic.md，包含 Step 8 **Model Reranker**（RERANK_PROVIDER 插件，fail-closed）。

Memory 侧特有的特征：

- **Template 保护**：Scope & Anchor Guard 对持有 `channel: "template"` 证据的候选免除数字锚点冲突检查，避免 `Press Enter to switch to {VAR_0}` 类模板被误 hard-filter。
- **语义 hard-negative 抑制**：当 top 候选是 clear Tier-1 winner（模板/精确命中），`suppressTier3IfClearTier1Winner` 会抑制所有 Tier-3 候选（如偶然语义命中的 witch 等 hard-negative），保障高置信度结果不被噪声候选稀释。

---

## Context-Route 重排（recallContextRerankOp）

`recallContextRerankOp`（[recall-context-rerank.ts](../src/recall-context-rerank.ts)）在路由层（`onNew`）对 `collectMemoryRecallOp` 的结果做可选的上下文感知重排，与 term 侧的 `rerankTermRecallOp` 共享 Band Selector + Orchestrator 机制（参见 04-term-recall.semantic.md 的"Context-Route 重排"节）。Memory 侧的差异如下：

- **候选 ID**：使用 `memory:${m.id}`（而非 `term:${m.conceptId}`）。
- **上下文信号**：只有 `sourceOverlap`（邻近元素原文）与 `targetOverlap`（邻近元素已审批译文），**无** `conceptOverlap`（记忆条目不携带 concept/subject 定义）。
- **归一化字段**：`title = m.source`，无 `definitionText` / `contextText`。
- 原始 `confidence` 值在重排前后保持不变；provider metadata 不进入面向用户的 recall API 响应。

---

## 流式协议（onNew 路由）

`memory.onNew` 是服务端 generator，对 `recallContextRerankOp` 的结果逐一 `yield`，无 LLM 延迟。客户端收到的每条 `MemorySuggestion` 均为原始精排结果，不含 LLM 生成内容，`adaptationPending` 字段不会被设置。

如需 LLM 增强建议，请参阅 `09-smart-suggest.semantic.md`。

---

## 回归测试

`memory-recall-regression.test.ts`（[源码](../src/memory-recall-regression.test.ts)）通过 fixture 回归门验证四条通道各自的命中行为不发生静默退化。测试场景包括：exact 精确命中、trgm 近似命中、variant 词形变化命中、TOKEN_TEMPLATE 模板适配正确性，以及 Precision Pipeline 层的精排行为（Tier 分配、template vs semantic hard-negative 竞争场景）。
