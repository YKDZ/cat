# @cat/operations

Operations layer: composing domain operations into business workflows, functions suffixed with Op

## Overview

- **Modules**: 46
- **Exported functions**: 46
- **Exported types**: 79

## Function Index

### src

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `vectorizeToChunkSetOp` | { data, vectorStorageId, vectorizerId }, ctx? | `Promise<{ chunkSetIds: number[]; }>` | 向量化文本并存储 ChunkSet

使用 TEXT_VECTORIZER 插件将文本转为向量，
创建 ChunkSet/Chunk 行并通过 VECTOR_STORAGE 插件持久化向量。 |
| `vectorTermAlignOp` | data, ctx? | `Promise<{ alignedPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; similarity: number; }[]; stringIds: { groupIndex: number; candidateIndex: number; stringId: number; }[]; }>` | 向量相似度术语对齐

1. 把每个候选术语（text + definition）向量化并创建正式 TranslatableString（Decision #4-C）
2. 跨语言组进行两两余弦相似度对比
3. 相似度 >= minSimilarity 的配对记录进 alignedPairs |
| `upsertDocumentFromFileOp` | data, ctx? | `Promise<{ success: boolean; addedCount: number; removedCount: number; }>` | 从文件更新文档

1. 解析文件获取元素列表
2. 获取文档当前的旧元素
3. 比较新旧元素并执行增删改 |
| `updateConceptOp` | data, ctx? | `Promise<{ updated: boolean; }>` | 更新 termConcept 的定义和/或 M:N 主题关联。

写入完成后由领域事件处理器自动触发概念重向量化。 |
| `triggerConceptRevectorize` | conceptId, ctx? | `void` | 解析当前可用的 TEXT_VECTORIZER / VECTOR_STORAGE 插件，
如果两者均就绪，则以 fire-and-forget 方式触发概念重向量化。

若任一插件不可用，则静默跳过（graceful degradation）。 |
| `tokenizeOp` | payload, ctx? | `Promise<{ tokens: import("/workspaces/cat/packages/plugin-core/dist/index").Token[]; }>` | 文本分词

通过所有已注册的 TOKENIZER 插件按优先级分词。 |
| `termRecallOp` | data, _ctx? | `Promise<{ terms: { term: string; translation: string; definition: string | null; conceptId: number; glossaryId: string; confidence: number; concept: { subjects: { name: string; defaultDefinition: string | null; }[]; definition: string | null; }; }[]; }>` | - |
| `streamSearchTermsOp` | data, ctx? | `AsyncIterable<{ term: string; translation: string; definition: string | null; conceptId: number; glossaryId: string; confidence: number; }>` | 组合术语搜索 — 双通道流式输出

同时启动两种搜索策略，结果通过 {@link AsyncMessageQueue} 以流的形式推送：

1. **ILIKE + word_similarity 词法匹配**（快）：基于 pg_trgm GIN 索引，几乎实时返回，先抵达。
2. **向量语义搜索**（慢）：需要向量化查询文本，若插件不可用则自动跳过。

两路结果按 `(term text, conceptId)` 复合键全局去重（先到先得），保证调用方拿到的是唯一结果集。
返回的 `AsyncIterable` 可直接用 `for await` 消费或在 oRPC `async function*` 中 yield。 |
| `streamSearchMemoryOp` | data, ctx? | `AsyncIterable<{ id: number; translationChunkSetId: number; source: string; translation: string; memoryId: string; creatorId: string | null; confidence: number; createdAt: Date; updatedAt: Date; adaptedTranslation?: string | undefined; adaptationMethod?: "exact" | "token-replaced" | "llm-adapted" | undefined; }>` | Three-channel streaming memory search.

Returns an AsyncIterable that yields MemorySuggestion items as they arrive
from the three channels. Exact matches arrive first, followed by trgm,
then vector results.

For non-exact results that have stored templates, attempts deterministic
placeholder replacement to produce an `adaptedTranslation`. |
| `statisticalTermExtractOp` | data, ctx? | `Promise<{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; nlpSegmenterUsed: "plugin" | "intl-fallback"; }>` | 统计学术语提取

内部调用 nlpBatchSegmentOp 进行 NLP 分词，然后通过 POS 过滤 + N-gram 生成
+ TF-IDF + C-value 算法提取高置信度术语候选。 |
| `statisticalTermAlignOp` | data, ctx? | `Promise<{ alignedPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; coOccurrenceScore: number; }[]; }>` | 统计共现术语对齐

利用 CAT 系统天然的翻译对关系进行共现比对:
- 优先利用翻译对关系（translationId 级别）
- 若无翻译，回退到元素级共现（elementId 级别） |
| `semanticSearchTermsOp` | data, _ctx? | `Promise<SemanticSearchTermsOutput>` | 语义术语搜索

将查询文本向量化后，在指定词汇表的已向量化 termConcept 中进行余弦相似度搜索，
返回与查询语义相关的术语对列表。

要求每个目标 termConcept 已通过 {@link revectorizeConceptOp} 建立向量索引。
若词汇表中尚无已向量化的概念，则返回空数组。 |
| `searchMemoryOp` | data, ctx? | `Promise<{ memories: { id: number; translationChunkSetId: number; source: string; translation: string; memoryId: string; creatorId: string | null; confidence: number; createdAt: Date; updatedAt: Date; adaptedTranslation?: string | undefined; adaptationMethod?: "exact" | "token-replaced" | "llm-adapted" | undefined; }[]; }>` | 搜索翻译记忆

在指定记忆库中通过向量相似度搜索匹配的翻译记忆。
合并了原 workflow 的 dependencies（计算搜索范围）和 handler（处理结果）。 |
| `searchChunkOp` | payload, ctx? | `Promise<{ chunks: { chunkId: number; similarity: number; }[]; }>` | 向量 chunk 搜索

支持两种查询模式：
1. 通过 queryChunkIds 从数据库检索已有嵌入向量
2. 通过 queryVectors 直接传入原始向量（跳过 DB 查询）

然后在指定范围内进行余弦相似度搜索。 |
| `revectorizeOp` | payload, _ctx? | `Promise<Record<string, never>>` | 重新向量化已有的 chunk

使用新的向量化器更新既有 chunk 的嵌入向量，
适用于切换向量化模型后的数据迁移场景。 |
| `revectorizeConceptOp` | data, ctx? | `Promise<{ skipped: boolean; }>` | 重新向量化 termConcept 的结构化描述文本。

构建新的向量化文本 → 与 `translatableString.value` 比对 →
相同则跳过（去重），否则向量化并更新 `termConcept.stringId`。 |
| `retrieveEmbeddingsOp` | data, _ctx? | `Promise<{ embeddings: number[][]; vectorStorageId: number; }>` | 获取 chunk 的嵌入向量

从 VECTOR_STORAGE 插件中检索指定 chunk 的向量表示。 |
| `registerDomainEventHandlers` | - | `void` | - |
| `qaOp` | payload, _ctx? | `Promise<{ result: { meta: any; isPassed: boolean; checkerId: number; }[]; }>` | 质量检查

使用所有已注册的 QA_CHECKER 插件对源文本/翻译文本进行质量检查。 |
| `qaTranslationOp` | payload, ctx? | `Promise<Record<string, never>>` | 翻译质量检查

对指定翻译执行完整 QA 流程：
1. 获取翻译文本、源文本及语言信息
2. 查找相关术语（统一走后端）
3. 并行对源文本和翻译文本进行分词（含术语标注）
4. 创建 QA 结果记录
5. 执行 QA 检查并持久化结果 |
| `parseFileOp` | data, _ctx? | `Promise<{ elements: { text: string; sortIndex: number; languageId: string; meta: any; sourceStartLine?: number | null | undefined; sourceEndLine?: number | null | undefined; sourceLocationMeta?: any; }[]; }>` | 解析文件内容为可翻译元素列表

通过 FILE_IMPORTER 插件解析文件，并补全 sortIndex。 |
| `nlpSegmentOp` | data, ctx? | `Promise<{ sentences: { text: string; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; start: number; end: number; }[]; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; }>` | 单文本 NLP 分词

通过 NLP_WORD_SEGMENTER 插件服务进行语言学分词。
当没有可用的 NLP_WORD_SEGMENTER 插件时，自动回退到内置 Intl.Segmenter。 |
| `intlSegmenterFallback` | text, languageId | `{ sentences: { text: string; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; start: number; end: number; }[]; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; }` | 基于 Intl.Segmenter 的内嵌回退分词实现

在没有可用的 NLP_WORD_SEGMENTER 插件时自动调用。
局限性：无 POS 标注（pos 设为 "X" 或 "PUNCT"/"NUM"）、无 lemma（lemma 等于 text 的小写形式）、
停用词仅覆盖基础英文词汇。 |
| `nlpBatchSegmentOp` | data, ctx? | `Promise<{ results: { id: string; result: { sentences: { text: string; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; start: number; end: number; }[]; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; }; }[]; }>` | 批量文本 NLP 分词

通过 NLP_WORD_SEGMENTER 插件服务批量进行语言学分词。
当没有可用的 NLP_WORD_SEGMENTER 插件时，自动回退到内置 Intl.Segmenter 逐条处理。 |
| `mergeAlignmentOp` | data | `{ alignedGroups: { terms: { languageId: string; text: string; normalizedText?: string | undefined; definition?: string | null | undefined; subjects?: string[] | null | undefined; stringId?: number | null | undefined; }[]; confidence: number; alignmentSources: ("vector" | "statistical" | "llm")[]; }[]; unaligned: { text: string; languageId: string; reason: string; }[]; stats: { totalInputTerms: number; totalAlignedGroups: number; vectorAlignments: number; statisticalAlignments: number; llmAlignments: number; }; }` | 多策略对齐结果融合

1. 将向量、统计、LLM 三路对齐结果按加权平均融合
2. 通过 Union-Find 进行传递闭包，生成多语言术语组
3. 冲突解决：同语言多候选保留连接度最高的候选 |
| `insertMemory` | tx, memoryIds, translationIds | `Promise<{ memoryItemIds: number[]; }>` | - |
| `placeholderize` | tokens, originalText | `PlaceholderResult` | Convert a flat token sequence into a placeholder template.

All token types except `text`, `unknown`, and whitespace-like types
are replaced with `{TYPE_N}` placeholders where N is a per-type counter. |
| `fillTemplate` | translationTemplate, translationSlots, sourceSlots | `string | null` | Attempt to fill a translation template with values from a source mapping.

Given:
- A translation template (e.g. "错误码：{NUM_0}")
- Translation slots from the stored memory
- Source slots from the current input text

This replaces each placeholder in the translation template with the
corresponding value from the current source text's slots (matched by
placeholder name), falling back to the stored translation's original value. |
| `slotsToMapping` | slots | `SlotMappingEntry[]` | Convert PlaceholderSlots to a serializable mapping for DB storage. |
| `mappingToSlots` | mapping | `PlaceholderSlot[]` | Convert a stored slot mapping back to PlaceholderSlots.
Note: start/end offsets are not preserved in storage,
they are only needed at placeholderize time. |
| `lookupTermsForElementOp` | elementId, translationLanguageId, _ctx? | `Promise<{ term: string; termLanguageId: string; translation: string; translationLanguageId: string; definition?: string | null | undefined; subjectIds?: number[] | null | undefined; conceptId?: number | null | undefined; glossaryId?: string | null | undefined; }[]>` | 根据 elementId 从后端自动查找相关术语

复用 glossary.findTerm 路由中的查询链：
element → document → project → glossaryIds → lexical term query

使用 ILIKE + word_similarity 进行术语匹配（不含语义搜索） |
| `loadElementTextsOp` | data, _ctx? | `Promise<{ elements: { elementId: number; text: string; languageId: string; }[]; }>` | 加载元素文本

根据 documentIds 或 elementIds 批量加载 TranslatableElement 及其
TranslatableString.value，返回统一格式的文本列表。 |
| `llmTermEnhanceOp` | data, ctx? | `Promise<{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; source: "statistical" | "llm" | "both"; existsInGlossary: boolean; existingConceptId: number | null; definition: string | null; subjects: string[] | null; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; llmCandidatesAdded: number; }>` | LLM 术语增强

对低置信度候选进行 LLM 校验：判断是否为真正的术语，
并批量生成 definition 和 subject。

高置信度候选（>= confidenceThreshold）保留统计学结果，仅生成 definition/subject。
低置信度候选需LLM校验后决定是否保留。 |
| `llmTermAlignOp` | data, ctx? | `Promise<{ alignedPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; llmScore: number; }[]; }>` | LLM 术语对齐（兜底策略）

对向量对齐和统计对齐未能高置信度处理的候选对进行 LLM 判断。 |
| `llmRefineTranslationOp` | data, ctx? | `Promise<{ refinedText: string; refined: boolean; }>` | - |
| `fetchAdviseOp` | data, ctx? | `Promise<{ suggestions: { translation: string; confidence: number; meta?: any; }[]; }>` | 获取翻译建议

通过 TRANSLATION_ADVISOR 插件服务获取机器翻译建议，
支持术语表上下文注入、翻译记忆和元素上下文。 |
| `diffElementsOp` | data, ctx? | `Promise<{ addedElementIds: number[]; removedElementIds: number[]; documentId: string; }>` | 比较新旧元素并执行增删改

1. 获取旧元素
2. 通过 meta 匹配新旧元素
3. 处理文本更新、排序更新、位置更新
4. 创建新增元素
5. 删除移除的元素 |
| `deleteTermOp` | data, ctx? | `Promise<{ deleted: boolean; conceptId: number | null; }>` | 删除一条术语条目。

删除术语后由领域事件处理器自动触发概念重向量化。 |
| `deduplicateAndMatchOp` | data, _ctx? | `Promise<{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; source: "statistical" | "llm" | "both"; existsInGlossary: boolean; existingConceptId: number | null; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; }>` | 去重 & 与现有术语库比对

1. 以 normalizedText (lemma) 为聚合键对候选进行归一化去重
2. 用 listLexicalTermSuggestions (pg_trgm word_similarity) 批量比对现有术语库
3. 标记已存在的术语 |
| `createTranslationOp` | data, ctx? | `Promise<{ translationIds: number[]; memoryItemIds: number[]; }>` | 创建翻译

1. 创建可翻译字符串（含向量化）
2. 插入翻译记录
3. 通过领域事件触发可选发布通知
4. 可选写入翻译记忆
5. 对每条翻译执行 QA 检查 |
| `createTranslatableStringOp` | data, ctx? | `Promise<{ stringIds: number[]; }>` | 创建可翻译字符串

先向量化文本数据，然后在数据库中创建 TranslatableString 行。 |
| `createTermOp` | data, ctx? | `Promise<{ termIds: number[]; }>` | 创建术语

直接存储术语文本（text + languageId），然后为每个 termConcept
构建结构化向量化文本并向量化。 |
| `createElementOp` | data, ctx? | `Promise<{ elementIds: number[]; }>` | 创建可翻译元素

先创建 TranslatableString（含向量化），然后插入 TranslatableElement 行。 |
| `autoTranslateOp` | data, ctx? | `Promise<{ translationIds?: number[] | undefined; }>` | 自动翻译

并行获取翻译建议和翻译记忆，根据决策逻辑选择最佳翻译并创建翻译记录。
优先级：记忆 > 机器翻译建议 |
| `addTermToConceptOp` | data, ctx? | `Promise<{ termId: number; }>` | 向已有 termConcept 添加一条术语条目。

写入完成后由领域事件处理器自动触发概念重向量化（术语列表变化会影响向量化文本）。 |
| `adaptMemoryOp` | input, _ctx? | `Promise<{ adaptedTranslation: string | null; }>` | Adapt a memory translation to fit the current source text via LLM.

Returns `{ adaptedTranslation: null }` when:
- No LLM_PROVIDER is available
- The LLM signals the texts are too different ([SKIP])
- Any error occurs during the LLM call |

## Type Index

| Type | Kind | Description |
|------|------|-------------|
| `VectorizeInput` | type | - |
| `VectorizeOutput` | type | - |
| `VectorTermAlignInput` | type | - |
| `VectorTermAlignOutput` | type | - |
| `UpsertDocumentInput` | type | - |
| `UpsertDocumentOutput` | type | - |
| `UpdateConceptInput` | type | - |
| `UpdateConceptOutput` | type | - |
| `TokenizeInput` | type | - |
| `TokenizeOutput` | type | - |
| `TermRecallInput` | type | - |
| `TermContext` | type | - |
| `TermRecallOutput` | type | - |
| `StreamSearchTermsInput` | type | - |
| `StreamSearchMemoryInput` | type | - |
| `StatisticalTermExtractInput` | type | - |
| `StatisticalTermExtractOutput` | type | - |
| `StatisticalTermAlignInput` | type | - |
| `StatisticalTermAlignOutput` | type | - |
| `SemanticSearchTermsInput` | type | - |
| `SemanticSearchTermsOutput` | type | - |
| `SearchMemoryInput` | type | - |
| `SearchMemoryOutput` | type | - |
| `SearchChunkInput` | type | - |
| `SearchChunkOutput` | type | - |
| `RevectorizeInput` | type | - |
| `RevectorizeOutput` | type | - |
| `RevectorizeConceptInput` | type | - |
| `RevectorizeConceptOutput` | type | - |
| `RetrieveEmbeddingsInput` | type | - |
| `RetrieveEmbeddingsOutput` | type | - |
| `QAInput` | type | - |
| `QAOutput` | type | - |
| `QaTranslationInput` | type | - |
| `QaTranslationOutput` | type | - |
| `ParseFileInput` | type | - |
| `ParseFileOutput` | type | - |
| `NlpSegmentInput` | type | - |
| `NlpSegmentOutput` | type | - |
| `NlpBatchSegmentInput` | type | - |
| `NlpBatchSegmentOutput` | type | - |
| `MergeAlignmentInput` | type | - |
| `MergeAlignmentOutput` | type | - |
| `PlaceholderSlot` | interface | - |
| `PlaceholderResult` | interface | - |
| `SlotMappingEntry` | interface | JSON-serializable slot mapping for database storage. |
| `LookupTermsInput` | type | - |
| `LookupTermsOutput` | type | - |
| `LoadElementTextsInput` | type | - |
| `LoadElementTextsOutput` | type | - |
| `LlmTermEnhanceInput` | type | - |
| `LlmTermEnhanceOutput` | type | - |
| `LlmTermAlignInput` | type | - |
| `LlmTermAlignOutput` | type | - |
| `LlmRefineTranslationInput` | type | - |
| `LlmRefineTranslationOutput` | type | - |
| `FetchAdviseInput` | type | - |
| `FetchAdviseOutput` | type | - |
| `DiffElementsInput` | type | - |
| `DiffElementsOutput` | type | - |
| `DeleteTermInput` | type | - |
| `DeleteTermOutput` | type | - |
| `DeduplicateAndMatchInput` | type | - |
| `DeduplicateAndMatchOutput` | type | - |
| `CreateTranslationInput` | type | - |
| `CreateTranslationOutput` | type | - |
| `CreateTranslationPubPayload` | type | - |
| `CreateTranslatableStringInput` | type | - |
| `CreateTranslatableStringOutput` | type | - |
| `CreateTermInput` | type | - |
| `CreateTermOutput` | type | - |
| `CreateElementInput` | type | - |
| `CreateElementOutput` | type | - |
| `AutoTranslateInput` | type | - |
| `AutoTranslateOutput` | type | - |
| `AddTermToConceptInput` | type | - |
| `AddTermToConceptOutput` | type | - |
| `AdaptMemoryInput` | type | - |
| `AdaptMemoryOutput` | type | - |

## Detailed Documentation

### src

#### `vectorizeToChunkSetOp`

向量化文本并存储 ChunkSet

使用 TEXT_VECTORIZER 插件将文本转为向量，
创建 ChunkSet/Chunk 行并通过 VECTOR_STORAGE 插件持久化向量。

```typescript
async vectorizeToChunkSetOp({ data, vectorStorageId, vectorizerId }: { vectorizerId: number; vectorStorageId: number; data: { languageId: string; text: string; }[]; }, ctx?: OperationContext | undefined): Promise<{ chunkSetIds: number[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| { data, vectorStorageId, vectorizerId } | `{ vectorizerId: number; vectorStorageId: number; data: { languageId: string; text: string; }[]; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `vectorTermAlignOp`

向量相似度术语对齐

1. 把每个候选术语（text + definition）向量化并创建正式 TranslatableString（Decision #4-C）
2. 跨语言组进行两两余弦相似度对比
3. 相似度 >= minSimilarity 的配对记录进 alignedPairs

```typescript
async vectorTermAlignOp(data: { termGroups: { languageId: string; candidates: { text: string; normalizedText?: string | undefined; definition?: string | null | undefined; }[]; }[]; config: { vectorizerId: number; vectorStorageId: number; minSimilarity: number; }; }, ctx?: OperationContext | undefined): Promise<{ alignedPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; similarity: number; }[]; stringIds: { groupIndex: number; candidateIndex: number; stringId: number; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ termGroups: { languageId: string; candidates: { text: string; normalizedText?: string | undefined; definition?: string | null | undefined; }[]; }[]; config: { vectorizerId: number; vectorStorageId: number; minSimilarity: number; }; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `upsertDocumentFromFileOp`

从文件更新文档

1. 解析文件获取元素列表
2. 获取文档当前的旧元素
3. 比较新旧元素并执行增删改

```typescript
async upsertDocumentFromFileOp(data: { documentId: string; fileId: number; languageId: string; vectorizerId: number; vectorStorageId: number; }, ctx?: OperationContext | undefined): Promise<{ success: boolean; addedCount: number; removedCount: number; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ documentId: string; fileId: number; languageId: string; vectorizerId: number; vectorStorageId: number; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `updateConceptOp`

更新 termConcept 的定义和/或 M:N 主题关联。

写入完成后由领域事件处理器自动触发概念重向量化。

```typescript
async updateConceptOp(data: { conceptId: number; subjectIds?: number[] | undefined; definition?: string | undefined; }, ctx?: OperationContext | undefined): Promise<{ updated: boolean; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ conceptId: number; subjectIds?: number[] | undefined; definition?: string | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `triggerConceptRevectorize`

解析当前可用的 TEXT_VECTORIZER / VECTOR_STORAGE 插件，
如果两者均就绪，则以 fire-and-forget 方式触发概念重向量化。

若任一插件不可用，则静默跳过（graceful degradation）。

```typescript
triggerConceptRevectorize(conceptId: number, ctx?: OperationContext | undefined)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| conceptId | `number` | - |
| ctx? | `OperationContext | undefined` | - |

#### `tokenizeOp`

文本分词

通过所有已注册的 TOKENIZER 插件按优先级分词。

```typescript
async tokenizeOp(payload: { text: string; terms?: { term: string; termLanguageId: string; translation: string; translationLanguageId: string; definition?: string | null | undefined; subjectIds?: number[] | null | undefined; conceptId?: number | null | undefined; glossaryId?: string | null | undefined; }[] | undefined; }, ctx?: OperationContext | undefined): Promise<{ tokens: import("/workspaces/cat/packages/plugin-core/dist/index").Token[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| payload | `{ text: string; terms?: { term: string; termLanguageId: string; translation: string; translationLanguageId: string; definition?: string | null | undefined; subjectIds?: number[] | null | undefined; conceptId?: number | null | undefined; glossaryId?: string | null | undefined; }[] | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `termRecallOp`

```typescript
async termRecallOp(data: { text: string; sourceLanguageId: string; translationLanguageId: string; glossaryIds: string[]; wordSimilarityThreshold: number; }, _ctx?: OperationContext | undefined): Promise<{ terms: { term: string; translation: string; definition: string | null; conceptId: number; glossaryId: string; confidence: number; concept: { subjects: { name: string; defaultDefinition: string | null; }[]; definition: string | null; }; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ text: string; sourceLanguageId: string; translationLanguageId: string; glossaryIds: string[]; wordSimilarityThreshold: number; }` | - |
| _ctx? | `OperationContext | undefined` | - |

#### `streamSearchTermsOp`

组合术语搜索 — 双通道流式输出

同时启动两种搜索策略，结果通过 {@link AsyncMessageQueue} 以流的形式推送：

1. **ILIKE + word_similarity 词法匹配**（快）：基于 pg_trgm GIN 索引，几乎实时返回，先抵达。
2. **向量语义搜索**（慢）：需要向量化查询文本，若插件不可用则自动跳过。

两路结果按 `(term text, conceptId)` 复合键全局去重（先到先得），保证调用方拿到的是唯一结果集。
返回的 `AsyncIterable` 可直接用 `for await` 消费或在 oRPC `async function*` 中 yield。

```typescript
streamSearchTermsOp(data: { glossaryIds: string[]; text: string; sourceLanguageId: string; translationLanguageId: string; minConfidence?: number | undefined; maxAmount?: number | undefined; }, ctx?: OperationContext | undefined): AsyncIterable<{ term: string; translation: string; definition: string | null; conceptId: number; glossaryId: string; confidence: number; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ glossaryIds: string[]; text: string; sourceLanguageId: string; translationLanguageId: string; minConfidence?: number | undefined; maxAmount?: number | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `streamSearchMemoryOp`

Three-channel streaming memory search.

Returns an AsyncIterable that yields MemorySuggestion items as they arrive
from the three channels. Exact matches arrive first, followed by trgm,
then vector results.

For non-exact results that have stored templates, attempts deterministic
placeholder replacement to produce an `adaptedTranslation`.

```typescript
streamSearchMemoryOp(data: { text: string; sourceLanguageId: string; translationLanguageId: string; memoryIds: string[]; chunkIds: number[]; minSimilarity?: number | undefined; maxAmount?: number | undefined; }, ctx?: OperationContext | undefined): AsyncIterable<{ id: number; translationChunkSetId: number; source: string; translation: string; memoryId: string; creatorId: string | null; confidence: number; createdAt: Date; updatedAt: Date; adaptedTranslation?: string | undefined; adaptationMethod?: "exact" | "token-replaced" | "llm-adapted" | undefined; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ text: string; sourceLanguageId: string; translationLanguageId: string; memoryIds: string[]; chunkIds: number[]; minSimilarity?: number | undefined; maxAmount?: number | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `statisticalTermExtractOp`

统计学术语提取

内部调用 nlpBatchSegmentOp 进行 NLP 分词，然后通过 POS 过滤 + N-gram 生成
+ TF-IDF + C-value 算法提取高置信度术语候选。

```typescript
async statisticalTermExtractOp(data: { texts: { id: string; elementId: number; text: string; }[]; languageId: string; config: { maxTermTokens: number; minDocFreq: number; minTermLength: number; tfIdfThreshold: number; tfidfWeight: number; cvalueWeight: number; }; nlpSegmenterId?: number | undefined; }, ctx?: OperationContext | undefined): Promise<{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; nlpSegmenterUsed: "plugin" | "intl-fallback"; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ texts: { id: string; elementId: number; text: string; }[]; languageId: string; config: { maxTermTokens: number; minDocFreq: number; minTermLength: number; tfIdfThreshold: number; tfidfWeight: number; cvalueWeight: number; }; nlpSegmenterId?: number | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `statisticalTermAlignOp`

统计共现术语对齐

利用 CAT 系统天然的翻译对关系进行共现比对:
- 优先利用翻译对关系（translationId 级别）
- 若无翻译，回退到元素级共现（elementId 级别）

```typescript
async statisticalTermAlignOp(data: { termGroups: { languageId: string; candidates: { text: string; normalizedText?: string | undefined; occurrences?: { elementId: number; ranges: { start: number; end: number; }[]; translationId?: number | undefined; }[] | undefined; }[]; }[]; config: { minCoOccurrence: number; }; nlpSegmenterId?: number | undefined; }, ctx?: OperationContext | undefined): Promise<{ alignedPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; coOccurrenceScore: number; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ termGroups: { languageId: string; candidates: { text: string; normalizedText?: string | undefined; occurrences?: { elementId: number; ranges: { start: number; end: number; }[]; translationId?: number | undefined; }[] | undefined; }[]; }[]; config: { minCoOccurrence: number; }; nlpSegmenterId?: number | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `semanticSearchTermsOp`

语义术语搜索

将查询文本向量化后，在指定词汇表的已向量化 termConcept 中进行余弦相似度搜索，
返回与查询语义相关的术语对列表。

要求每个目标 termConcept 已通过 {@link revectorizeConceptOp} 建立向量索引。
若词汇表中尚无已向量化的概念，则返回空数组。

```typescript
async semanticSearchTermsOp(data: { glossaryIds: string[]; text: string; sourceLanguageId: string; translationLanguageId: string; vectorizerId: number; vectorStorageId: number; minSimilarity: number; maxAmount: number; }, _ctx?: OperationContext | undefined): Promise<SemanticSearchTermsOutput>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ glossaryIds: string[]; text: string; sourceLanguageId: string; translationLanguageId: string; vectorizerId: number; vectorStorageId: number; minSimilarity: number; maxAmount: number; }` | - |
| _ctx? | `OperationContext | undefined` | - |

#### `searchMemoryOp`

搜索翻译记忆

在指定记忆库中通过向量相似度搜索匹配的翻译记忆。
合并了原 workflow 的 dependencies（计算搜索范围）和 handler（处理结果）。

```typescript
async searchMemoryOp(data: { minSimilarity: number; maxAmount: number; chunkIds: number[]; memoryIds: string[]; sourceLanguageId: string; translationLanguageId: string; vectorStorageId: number; queryVectors?: number[][] | undefined; }, ctx?: OperationContext | undefined): Promise<{ memories: { id: number; translationChunkSetId: number; source: string; translation: string; memoryId: string; creatorId: string | null; confidence: number; createdAt: Date; updatedAt: Date; adaptedTranslation?: string | undefined; adaptationMethod?: "exact" | "token-replaced" | "llm-adapted" | undefined; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ minSimilarity: number; maxAmount: number; chunkIds: number[]; memoryIds: string[]; sourceLanguageId: string; translationLanguageId: string; vectorStorageId: number; queryVectors?: number[][] | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `searchChunkOp`

向量 chunk 搜索

支持两种查询模式：
1. 通过 queryChunkIds 从数据库检索已有嵌入向量
2. 通过 queryVectors 直接传入原始向量（跳过 DB 查询）

然后在指定范围内进行余弦相似度搜索。

```typescript
async searchChunkOp(payload: { minSimilarity: number; maxAmount: number; searchRange: number[]; queryChunkIds: number[]; vectorStorageId: number; queryVectors?: number[][] | undefined; }, ctx?: OperationContext | undefined): Promise<{ chunks: { chunkId: number; similarity: number; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| payload | `{ minSimilarity: number; maxAmount: number; searchRange: number[]; queryChunkIds: number[]; vectorStorageId: number; queryVectors?: number[][] | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `revectorizeOp`

重新向量化已有的 chunk

使用新的向量化器更新既有 chunk 的嵌入向量，
适用于切换向量化模型后的数据迁移场景。

```typescript
async revectorizeOp(payload: { chunkIds: number[]; vectorizerId: number; vectorStorageId: number; }, _ctx?: OperationContext | undefined): Promise<Record<string, never>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| payload | `{ chunkIds: number[]; vectorizerId: number; vectorStorageId: number; }` | - |
| _ctx? | `OperationContext | undefined` | - |

#### `revectorizeConceptOp`

重新向量化 termConcept 的结构化描述文本。

构建新的向量化文本 → 与 `translatableString.value` 比对 →
相同则跳过（去重），否则向量化并更新 `termConcept.stringId`。

```typescript
async revectorizeConceptOp(data: { conceptId: number; vectorizerId: number; vectorStorageId: number; }, ctx?: OperationContext | undefined): Promise<{ skipped: boolean; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ conceptId: number; vectorizerId: number; vectorStorageId: number; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `retrieveEmbeddingsOp`

获取 chunk 的嵌入向量

从 VECTOR_STORAGE 插件中检索指定 chunk 的向量表示。

```typescript
async retrieveEmbeddingsOp(data: { chunkIds: number[]; }, _ctx?: OperationContext | undefined): Promise<{ embeddings: number[][]; vectorStorageId: number; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ chunkIds: number[]; }` | - |
| _ctx? | `OperationContext | undefined` | - |

#### `registerDomainEventHandlers`

```typescript
registerDomainEventHandlers()
```

#### `qaOp`

质量检查

使用所有已注册的 QA_CHECKER 插件对源文本/翻译文本进行质量检查。

```typescript
async qaOp(payload: { source: { languageId: string; text: string; tokens: Token[]; }; translation: { languageId: string; text: string; tokens: Token[]; }; glossaryIds: string[]; }, _ctx?: OperationContext | undefined): Promise<{ result: { meta: any; isPassed: boolean; checkerId: number; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| payload | `{ source: { languageId: string; text: string; tokens: Token[]; }; translation: { languageId: string; text: string; tokens: Token[]; }; glossaryIds: string[]; }` | - |
| _ctx? | `OperationContext | undefined` | - |

#### `qaTranslationOp`

翻译质量检查

对指定翻译执行完整 QA 流程：
1. 获取翻译文本、源文本及语言信息
2. 查找相关术语（统一走后端）
3. 并行对源文本和翻译文本进行分词（含术语标注）
4. 创建 QA 结果记录
5. 执行 QA 检查并持久化结果

```typescript
async qaTranslationOp(payload: { translationId: number; }, ctx?: OperationContext | undefined): Promise<Record<string, never>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| payload | `{ translationId: number; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `parseFileOp`

解析文件内容为可翻译元素列表

通过 FILE_IMPORTER 插件解析文件，并补全 sortIndex。

```typescript
async parseFileOp(data: { fileId: number; languageId: string; }, _ctx?: OperationContext | undefined): Promise<{ elements: { text: string; sortIndex: number; languageId: string; meta: any; sourceStartLine?: number | null | undefined; sourceEndLine?: number | null | undefined; sourceLocationMeta?: any; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ fileId: number; languageId: string; }` | - |
| _ctx? | `OperationContext | undefined` | - |

#### `nlpSegmentOp`

单文本 NLP 分词

通过 NLP_WORD_SEGMENTER 插件服务进行语言学分词。
当没有可用的 NLP_WORD_SEGMENTER 插件时，自动回退到内置 Intl.Segmenter。

```typescript
async nlpSegmentOp(data: { text: string; languageId: string; nlpSegmenterId?: number | undefined; }, ctx?: OperationContext | undefined): Promise<{ sentences: { text: string; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; start: number; end: number; }[]; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ text: string; languageId: string; nlpSegmenterId?: number | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `intlSegmenterFallback`

基于 Intl.Segmenter 的内嵌回退分词实现

在没有可用的 NLP_WORD_SEGMENTER 插件时自动调用。
局限性：无 POS 标注（pos 设为 "X" 或 "PUNCT"/"NUM"）、无 lemma（lemma 等于 text 的小写形式）、
停用词仅覆盖基础英文词汇。

```typescript
intlSegmenterFallback(text: string, languageId: string): { sentences: { text: string; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; start: number; end: number; }[]; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| text | `string` | - |
| languageId | `string` | - |

#### `nlpBatchSegmentOp`

批量文本 NLP 分词

通过 NLP_WORD_SEGMENTER 插件服务批量进行语言学分词。
当没有可用的 NLP_WORD_SEGMENTER 插件时，自动回退到内置 Intl.Segmenter 逐条处理。

```typescript
async nlpBatchSegmentOp(data: { items: { id: string; text: string; }[]; languageId: string; nlpSegmenterId?: number | undefined; }, ctx?: OperationContext | undefined): Promise<{ results: { id: string; result: { sentences: { text: string; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; start: number; end: number; }[]; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; }; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ items: { id: string; text: string; }[]; languageId: string; nlpSegmenterId?: number | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `mergeAlignmentOp`

多策略对齐结果融合

1. 将向量、统计、LLM 三路对齐结果按加权平均融合
2. 通过 Union-Find 进行传递闭包，生成多语言术语组
3. 冲突解决：同语言多候选保留连接度最高的候选

```typescript
mergeAlignmentOp(data: { termGroups: { languageId: string; candidates: { text: string; normalizedText?: string | undefined; confidence?: number | undefined; definition?: string | null | undefined; subjects?: string[] | null | undefined; }[]; }[]; vectorPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; similarity: number; }[]; statisticalPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; coOccurrenceScore: number; }[]; llmPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; llmScore: number; }[]; stringIds: { groupIndex: number; candidateIndex: number; stringId: number; }[]; config?: { minFusedScore: number; weights?: { vector: number; statistical: number; llm: number; } | undefined; } | undefined; }): { alignedGroups: { terms: { languageId: string; text: string; normalizedText?: string | undefined; definition?: string | null | undefined; subjects?: string[] | null | undefined; stringId?: number | null | undefined; }[]; confidence: number; alignmentSources: ("vector" | "statistical" | "llm")[]; }[]; unaligned: { text: string; languageId: string; reason: string; }[]; stats: { totalInputTerms: number; totalAlignedGroups: number; vectorAlignments: number; statisticalAlignments: number; llmAlignments: number; }; }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ termGroups: { languageId: string; candidates: { text: string; normalizedText?: string | undefined; confidence?: number | undefined; definition?: string | null | undefined; subjects?: string[] | null | undefined; }[]; }[]; vectorPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; similarity: number; }[]; statisticalPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; coOccurrenceScore: number; }[]; llmPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; llmScore: number; }[]; stringIds: { groupIndex: number; candidateIndex: number; stringId: number; }[]; config?: { minFusedScore: number; weights?: { vector: number; statistical: number; llm: number; } | undefined; } | undefined; }` | - |

#### `insertMemory`

```typescript
async insertMemory(tx: DbHandle, memoryIds: string[], translationIds: number[]): Promise<{ memoryItemIds: number[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| tx | `DbHandle` | - |
| memoryIds | `string[]` | - |
| translationIds | `number[]` | - |

#### `placeholderize`

Convert a flat token sequence into a placeholder template.

All token types except `text`, `unknown`, and whitespace-like types
are replaced with `{TYPE_N}` placeholders where N is a per-type counter.

```typescript
placeholderize(tokens: Token[], originalText: string): PlaceholderResult
```

| Parameter | Type | Description |
|-----------|------|-------------|
| tokens | `Token[]` | - Flat token array from `tokenize()` / `tokenizeOp()` |
| originalText | `string` | - The original text (used for offset extraction) |

**Returns**: Template string and slot mappings

#### `fillTemplate`

Attempt to fill a translation template with values from a source mapping.

Given:
- A translation template (e.g. "错误码：{NUM_0}")
- Translation slots from the stored memory
- Source slots from the current input text

This replaces each placeholder in the translation template with the
corresponding value from the current source text's slots (matched by
placeholder name), falling back to the stored translation's original value.

```typescript
fillTemplate(translationTemplate: string, translationSlots: PlaceholderSlot[], sourceSlots: PlaceholderSlot[]): string | null
```

| Parameter | Type | Description |
|-----------|------|-------------|
| translationTemplate | `string` | - |
| translationSlots | `PlaceholderSlot[]` | - |
| sourceSlots | `PlaceholderSlot[]` | - |

**Returns**: The filled translation string, or null if slots are incompatible.

#### `slotsToMapping`

Convert PlaceholderSlots to a serializable mapping for DB storage.

```typescript
slotsToMapping(slots: PlaceholderSlot[]): SlotMappingEntry[]
```

| Parameter | Type | Description |
|-----------|------|-------------|
| slots | `PlaceholderSlot[]` | - |

#### `mappingToSlots`

Convert a stored slot mapping back to PlaceholderSlots.
Note: start/end offsets are not preserved in storage,
they are only needed at placeholderize time.

```typescript
mappingToSlots(mapping: SlotMappingEntry[]): PlaceholderSlot[]
```

| Parameter | Type | Description |
|-----------|------|-------------|
| mapping | `SlotMappingEntry[]` | - |

#### `lookupTermsForElementOp`

根据 elementId 从后端自动查找相关术语

复用 glossary.findTerm 路由中的查询链：
element → document → project → glossaryIds → lexical term query

使用 ILIKE + word_similarity 进行术语匹配（不含语义搜索）

```typescript
async lookupTermsForElementOp(elementId: number, translationLanguageId: string, _ctx?: OperationContext | undefined): Promise<{ term: string; termLanguageId: string; translation: string; translationLanguageId: string; definition?: string | null | undefined; subjectIds?: number[] | null | undefined; conceptId?: number | null | undefined; glossaryId?: string | null | undefined; }[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| elementId | `number` | - |
| translationLanguageId | `string` | - |
| _ctx? | `OperationContext | undefined` | - |

#### `loadElementTextsOp`

加载元素文本

根据 documentIds 或 elementIds 批量加载 TranslatableElement 及其
TranslatableString.value，返回统一格式的文本列表。

```typescript
async loadElementTextsOp(data: { sourceLanguageId: string; documentIds?: string[] | undefined; elementIds?: number[] | undefined; }, _ctx?: OperationContext | undefined): Promise<{ elements: { elementId: number; text: string; languageId: string; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ sourceLanguageId: string; documentIds?: string[] | undefined; elementIds?: number[] | undefined; }` | - |
| _ctx? | `OperationContext | undefined` | - |

#### `llmTermEnhanceOp`

LLM 术语增强

对低置信度候选进行 LLM 校验：判断是否为真正的术语，
并批量生成 definition 和 subject。

高置信度候选（>= confidenceThreshold）保留统计学结果，仅生成 definition/subject。
低置信度候选需LLM校验后决定是否保留。

```typescript
async llmTermEnhanceOp(data: { candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; source: "statistical" | "llm" | "both"; existsInGlossary: boolean; existingConceptId: number | null; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; sourceLanguageId: string; config: { confidenceThreshold: number; batchSize: number; inferDefinition: boolean; inferSubject: boolean; useRelaxedThreshold: boolean; llmProviderId?: number | undefined; }; }, ctx?: OperationContext | undefined): Promise<{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; source: "statistical" | "llm" | "both"; existsInGlossary: boolean; existingConceptId: number | null; definition: string | null; subjects: string[] | null; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; llmCandidatesAdded: number; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; source: "statistical" | "llm" | "both"; existsInGlossary: boolean; existingConceptId: number | null; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; sourceLanguageId: string; config: { confidenceThreshold: number; batchSize: number; inferDefinition: boolean; inferSubject: boolean; useRelaxedThreshold: boolean; llmProviderId?: number | undefined; }; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `llmTermAlignOp`

LLM 术语对齐（兜底策略）

对向量对齐和统计对齐未能高置信度处理的候选对进行 LLM 判断。

```typescript
async llmTermAlignOp(data: { termGroups: { languageId: string; candidates: { text: string; posPattern?: string[] | null | undefined; definition?: string | null | undefined; }[]; }[]; unalignedGroupPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; }[]; config: { batchSize: number; llmProviderId?: number | undefined; }; }, ctx?: OperationContext | undefined): Promise<{ alignedPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; llmScore: number; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ termGroups: { languageId: string; candidates: { text: string; posPattern?: string[] | null | undefined; definition?: string | null | undefined; }[]; }[]; unalignedGroupPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; }[]; config: { batchSize: number; llmProviderId?: number | undefined; }; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `llmRefineTranslationOp`

```typescript
async llmRefineTranslationOp(data: { sourceText: string; sourceLanguageId: string; targetLanguageId: string; candidateTranslation: string; terms: { term: string; translation: string; definition: string | null; }[]; temperature: number; maxTokens: number; neighborTranslations?: { source: string; translation: string; }[] | undefined; llmProviderId?: number | undefined; systemPrompt?: string | undefined; }, ctx?: OperationContext | undefined): Promise<{ refinedText: string; refined: boolean; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ sourceText: string; sourceLanguageId: string; targetLanguageId: string; candidateTranslation: string; terms: { term: string; translation: string; definition: string | null; }[]; temperature: number; maxTokens: number; neighborTranslations?: { source: string; translation: string; }[] | undefined; llmProviderId?: number | undefined; systemPrompt?: string | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `fetchAdviseOp`

获取翻译建议

通过 TRANSLATION_ADVISOR 插件服务获取机器翻译建议，
支持术语表上下文注入、翻译记忆和元素上下文。

```typescript
async fetchAdviseOp(data: { text: string; sourceLanguageId: string; translationLanguageId: string; glossaryIds: string[]; memoryIds: string[]; advisorId?: number | undefined; elementId?: number | undefined; preloadedTerms?: { term: string; translation: string; confidence: number; definition: string | null; concept: { subjects: { name: string; defaultDefinition: string | null; }[]; definition: string | null; }; }[] | undefined; preloadedMemories?: { source: string; translation: string; confidence: number; }[] | undefined; }, ctx?: OperationContext | undefined): Promise<{ suggestions: { translation: string; confidence: number; meta?: any; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ text: string; sourceLanguageId: string; translationLanguageId: string; glossaryIds: string[]; memoryIds: string[]; advisorId?: number | undefined; elementId?: number | undefined; preloadedTerms?: { term: string; translation: string; confidence: number; definition: string | null; concept: { subjects: { name: string; defaultDefinition: string | null; }[]; definition: string | null; }; }[] | undefined; preloadedMemories?: { source: string; translation: string; confidence: number; }[] | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `diffElementsOp`

比较新旧元素并执行增删改

1. 获取旧元素
2. 通过 meta 匹配新旧元素
3. 处理文本更新、排序更新、位置更新
4. 创建新增元素
5. 删除移除的元素

```typescript
async diffElementsOp(data: { elementData: { text: string; sortIndex: number; languageId: string; meta: any; sourceStartLine?: number | null | undefined; sourceEndLine?: number | null | undefined; sourceLocationMeta?: any; }[]; oldElementIds: number[]; documentId: string; vectorizerId: number; vectorStorageId: number; }, ctx?: OperationContext | undefined): Promise<{ addedElementIds: number[]; removedElementIds: number[]; documentId: string; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ elementData: { text: string; sortIndex: number; languageId: string; meta: any; sourceStartLine?: number | null | undefined; sourceEndLine?: number | null | undefined; sourceLocationMeta?: any; }[]; oldElementIds: number[]; documentId: string; vectorizerId: number; vectorStorageId: number; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `deleteTermOp`

删除一条术语条目。

删除术语后由领域事件处理器自动触发概念重向量化。

```typescript
async deleteTermOp(data: { termId: number; }, ctx?: OperationContext | undefined): Promise<{ deleted: boolean; conceptId: number | null; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ termId: number; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `deduplicateAndMatchOp`

去重 & 与现有术语库比对

1. 以 normalizedText (lemma) 为聚合键对候选进行归一化去重
2. 用 listLexicalTermSuggestions (pg_trgm word_similarity) 批量比对现有术语库
3. 标记已存在的术语

```typescript
async deduplicateAndMatchOp(data: { candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; source: "statistical" | "llm" | "both"; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; glossaryId: string; sourceLanguageId: string; }, _ctx?: OperationContext | undefined): Promise<{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; source: "statistical" | "llm" | "both"; existsInGlossary: boolean; existingConceptId: number | null; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; source: "statistical" | "llm" | "both"; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; glossaryId: string; sourceLanguageId: string; }` | - |
| _ctx? | `OperationContext | undefined` | - |

#### `createTranslationOp`

创建翻译

1. 创建可翻译字符串（含向量化）
2. 插入翻译记录
3. 通过领域事件触发可选发布通知
4. 可选写入翻译记忆
5. 对每条翻译执行 QA 检查

```typescript
async createTranslationOp(data: { data: { translatableElementId: number; text: string; languageId: string; translatorId?: string | undefined; meta?: z.core.util.JSONType | undefined; }[]; translatorId: string | null; memoryIds: string[]; vectorizerId: number; vectorStorageId: number; documentId: string; }, ctx?: OperationContext | undefined): Promise<{ translationIds: number[]; memoryItemIds: number[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ data: { translatableElementId: number; text: string; languageId: string; translatorId?: string | undefined; meta?: z.core.util.JSONType | undefined; }[]; translatorId: string | null; memoryIds: string[]; vectorizerId: number; vectorStorageId: number; documentId: string; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `createTranslatableStringOp`

创建可翻译字符串

先向量化文本数据，然后在数据库中创建 TranslatableString 行。

```typescript
async createTranslatableStringOp(data: { data: { text: string; languageId: string; }[]; vectorizerId: number; vectorStorageId: number; }, ctx?: OperationContext | undefined): Promise<{ stringIds: number[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ data: { text: string; languageId: string; }[]; vectorizerId: number; vectorStorageId: number; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `createTermOp`

创建术语

直接存储术语文本（text + languageId），然后为每个 termConcept
构建结构化向量化文本并向量化。

```typescript
async createTermOp(data: { glossaryId: string; data: { term: string; termLanguageId: string; translation: string; translationLanguageId: string; definition?: string | null | undefined; subjectIds?: number[] | null | undefined; conceptId?: number | null | undefined; glossaryId?: string | null | undefined; }[]; vectorizerId: number; vectorStorageId: number; creatorId?: string | undefined; }, ctx?: OperationContext | undefined): Promise<{ termIds: number[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ glossaryId: string; data: { term: string; termLanguageId: string; translation: string; translationLanguageId: string; definition?: string | null | undefined; subjectIds?: number[] | null | undefined; conceptId?: number | null | undefined; glossaryId?: string | null | undefined; }[]; vectorizerId: number; vectorStorageId: number; creatorId?: string | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `createElementOp`

创建可翻译元素

先创建 TranslatableString（含向量化），然后插入 TranslatableElement 行。

```typescript
async createElementOp(data: { data: { documentId: string; text: string; languageId: string; meta?: z.core.util.JSONType | undefined; creatorId?: string | undefined; sortIndex?: number | undefined; sourceStartLine?: number | null | undefined; sourceEndLine?: number | null | undefined; sourceLocationMeta?: z.core.util.JSONType | undefined; }[]; vectorizerId: number; vectorStorageId: number; }, ctx?: OperationContext | undefined): Promise<{ elementIds: number[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ data: { documentId: string; text: string; languageId: string; meta?: z.core.util.JSONType | undefined; creatorId?: string | undefined; sortIndex?: number | undefined; sourceStartLine?: number | null | undefined; sourceEndLine?: number | null | undefined; sourceLocationMeta?: z.core.util.JSONType | undefined; }[]; vectorizerId: number; vectorStorageId: number; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `autoTranslateOp`

自动翻译

并行获取翻译建议和翻译记忆，根据决策逻辑选择最佳翻译并创建翻译记录。
优先级：记忆 > 机器翻译建议

```typescript
async autoTranslateOp(data: { translatableElementId: number; text: string; translationLanguageId: string; sourceLanguageId: string; translatorId: string | null; memoryIds: string[]; glossaryIds: string[]; chunkIds: number[]; minMemorySimilarity: number; maxMemoryAmount: number; memoryVectorStorageId: number; translationVectorStorageId: number; vectorizerId: number; documentId: string; advisorId?: number | undefined; }, ctx?: OperationContext | undefined): Promise<{ translationIds?: number[] | undefined; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ translatableElementId: number; text: string; translationLanguageId: string; sourceLanguageId: string; translatorId: string | null; memoryIds: string[]; glossaryIds: string[]; chunkIds: number[]; minMemorySimilarity: number; maxMemoryAmount: number; memoryVectorStorageId: number; translationVectorStorageId: number; vectorizerId: number; documentId: string; advisorId?: number | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `addTermToConceptOp`

向已有 termConcept 添加一条术语条目。

写入完成后由领域事件处理器自动触发概念重向量化（术语列表变化会影响向量化文本）。

```typescript
async addTermToConceptOp(data: { conceptId: number; text: string; languageId: string; type: "NOT_SPECIFIED" | "FULL_FORM" | "ACRONYM" | "ABBREVIATION" | "SHORT_FORM" | "VARIANT" | "PHRASE"; status: "NOT_SPECIFIED" | "PREFERRED" | "ADMITTED" | "NOT_RECOMMENDED" | "OBSOLETE"; creatorId?: string | undefined; }, ctx?: OperationContext | undefined): Promise<{ termId: number; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| data | `{ conceptId: number; text: string; languageId: string; type: "NOT_SPECIFIED" | "FULL_FORM" | "ACRONYM" | "ABBREVIATION" | "SHORT_FORM" | "VARIANT" | "PHRASE"; status: "NOT_SPECIFIED" | "PREFERRED" | "ADMITTED" | "NOT_RECOMMENDED" | "OBSOLETE"; creatorId?: string | undefined; }` | - |
| ctx? | `OperationContext | undefined` | - |

#### `adaptMemoryOp`

Adapt a memory translation to fit the current source text via LLM.

Returns `{ adaptedTranslation: null }` when:
- No LLM_PROVIDER is available
- The LLM signals the texts are too different ([SKIP])
- Any error occurs during the LLM call

```typescript
async adaptMemoryOp(input: { sourceText: string; memorySource: string; memoryTranslation: string; sourceLanguageId: string; translationLanguageId: string; }, _ctx?: OperationContext | undefined): Promise<{ adaptedTranslation: string | null; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| input | `{ sourceText: string; memorySource: string; memoryTranslation: string; sourceLanguageId: string; translationLanguageId: string; }` | - |
| _ctx? | `OperationContext | undefined` | - |


*Last updated: 2026-04-02*