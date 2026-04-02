# @cat/operations

Operations layer: business workflows composing domain operations

## Overview

* **Modules**: 44

* **Exported functions**: 46

* **Exported types**: 79

## Function Index

### packages/operations/src

### `adaptMemoryOp`

```ts
/**
 * Adapt a memory translation to fit the current source text via LLM.
 *
 * Returns `{ adaptedTranslation: null }` when:
 * - No LLM_PROVIDER is available
 * - The LLM signals the texts are too different ([SKIP])
 * - Any error occurs during the LLM call
 */
export const adaptMemoryOp = async (input: AdaptMemoryInput, _ctx?: OperationContext): Promise<{ adaptedTranslation: string | null; }>
```

### `addTermToConceptOp`

```ts
/**
 * 向已有 termConcept 添加一条术语条目。
 *
 * 写入完成后由领域事件处理器自动触发概念重向量化（术语列表变化会影响向量化文本）。
 */
export const addTermToConceptOp = async (data: AddTermToConceptInput, ctx?: OperationContext): Promise<{ termId: number; }>
```

### `autoTranslateOp`

```ts
/**
 * 自动翻译
 *
 * 并行获取翻译建议和翻译记忆，根据决策逻辑选择最佳翻译并创建翻译记录。
 * 优先级：记忆 > 机器翻译建议
 */
export const autoTranslateOp = async (data: AutoTranslateInput, ctx?: OperationContext): Promise<{ translationIds?: number[] | undefined; }>
```

### `createElementOp`

```ts
/**
 * 创建可翻译元素
 *
 * 先创建 TranslatableString（含向量化），然后插入 TranslatableElement 行。
 */
export const createElementOp = async (data: CreateElementInput, ctx?: OperationContext): Promise<{ elementIds: number[]; }>
```

### `createTermOp`

```ts
/**
 * 创建术语
 *
 * 直接存储术语文本（text + languageId），然后为每个 termConcept
 * 构建结构化向量化文本并向量化。
 */
export const createTermOp = async (data: CreateTermInput, ctx?: OperationContext): Promise<{ termIds: number[]; }>
```

### `createTranslatableStringOp`

```ts
/**
 * 创建可翻译字符串
 *
 * 先向量化文本数据，然后在数据库中创建 TranslatableString 行。
 */
export const createTranslatableStringOp = async (data: CreateTranslatableStringInput, ctx?: OperationContext): Promise<{ stringIds: number[]; }>
```

### `createTranslationOp`

```ts
/**
 * 创建翻译
 *
 * 1. 创建可翻译字符串（含向量化）
 * 2. 插入翻译记录
 * 3. 通过领域事件触发可选发布通知
 * 4. 可选写入翻译记忆
 * 5. 对每条翻译执行 QA 检查
 */
export const createTranslationOp = async (data: CreateTranslationInput, ctx?: OperationContext): Promise<{ translationIds: number[]; memoryItemIds: number[]; }>
```

### `deduplicateAndMatchOp`

```ts
/**
 * 去重 & 与现有术语库比对
 *
 * 1. 以 normalizedText (lemma) 为聚合键对候选进行归一化去重
 * 2. 用 listLexicalTermSuggestions (pg_trgm word_similarity) 批量比对现有术语库
 * 3. 标记已存在的术语
 */
export const deduplicateAndMatchOp = async (data: DeduplicateAndMatchInput, _ctx?: OperationContext): Promise<{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; source: "statistical" | "llm" | "both"; existsInGlossary: boolean; existingConceptId: number | null; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; }>
```

### `deleteTermOp`

```ts
/**
 * 删除一条术语条目。
 *
 * 删除术语后由领域事件处理器自动触发概念重向量化。
 */
export const deleteTermOp = async (data: DeleteTermInput, ctx?: OperationContext): Promise<{ deleted: boolean; conceptId: number | null; }>
```

### `diffElementsOp`

```ts
/**
 * 比较新旧元素并执行增删改
 *
 * 1. 获取旧元素
 * 2. 通过 meta 匹配新旧元素
 * 3. 处理文本更新、排序更新、位置更新
 * 4. 创建新增元素
 * 5. 删除移除的元素
 */
export const diffElementsOp = async (data: DiffElementsInput, ctx?: OperationContext): Promise<{ addedElementIds: number[]; removedElementIds: number[]; documentId: string; }>
```

### `fetchAdviseOp`

```ts
/**
 * 获取翻译建议
 *
 * 通过 TRANSLATION_ADVISOR 插件服务获取机器翻译建议，
 * 支持术语表上下文注入、翻译记忆和元素上下文。
 */
export const fetchAdviseOp = async (data: FetchAdviseInput, ctx?: OperationContext): Promise<{ suggestions: { translation: string; confidence: number; meta?: any; }[]; }>
```

### `llmRefineTranslationOp`

```ts
export const llmRefineTranslationOp = async (data: LlmRefineTranslationInput, ctx?: OperationContext): Promise<{ refinedText: string; refined: boolean; }>
```

### `llmTermAlignOp`

```ts
/**
 * LLM 术语对齐（兜底策略）
 *
 * 对向量对齐和统计对齐未能高置信度处理的候选对进行 LLM 判断。
 */
export const llmTermAlignOp = async (data: LlmTermAlignInput, ctx?: OperationContext): Promise<{ alignedPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; llmScore: number; }[]; }>
```

### `llmTermEnhanceOp`

```ts
/**
 * LLM 术语增强
 *
 * 对低置信度候选进行 LLM 校验：判断是否为真正的术语，
 * 并批量生成 definition 和 subject。
 *
 * 高置信度候选（>= confidenceThreshold）保留统计学结果，仅生成 definition/subject。
 * 低置信度候选需LLM校验后决定是否保留。
 */
export const llmTermEnhanceOp = async (data: LlmTermEnhanceInput, ctx?: OperationContext): Promise<{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; source: "statistical" | "llm" | "both"; existsInGlossary: boolean; existingConceptId: number | null; definition: string | null; subjects: string[] | null; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; llmCandidatesAdded: number; }>
```

### `loadElementTextsOp`

```ts
/**
 * 加载元素文本
 *
 * 根据 documentIds 或 elementIds 批量加载 TranslatableElement 及其
 * TranslatableString.value，返回统一格式的文本列表。
 */
export const loadElementTextsOp = async (data: LoadElementTextsInput, _ctx?: OperationContext): Promise<{ elements: { elementId: number; text: string; languageId: string; }[]; }>
```

### `lookupTermsForElementOp`

```ts
/**
 * 根据 elementId 从后端自动查找相关术语
 *
 * 复用 glossary.findTerm 路由中的查询链：
 * element → document → project → glossaryIds → lexical term query
 *
 * 使用 ILIKE + word_similarity 进行术语匹配（不含语义搜索）
 */
export const lookupTermsForElementOp = async (elementId: number, translationLanguageId: string, _ctx?: OperationContext): Promise<{ term: string; termLanguageId: string; translation: string; translationLanguageId: string; definition?: string | null | undefined; subjectIds?: number[] | null | undefined; conceptId?: number | null | undefined; glossaryId?: string | null | undefined; }[]>
```

### `placeholderize`

```ts
/**
 * Convert a flat token sequence into a placeholder template.
 *
 * All token types except `text`, `unknown`, and whitespace-like types
 * are replaced with `{TYPE_N}` placeholders where N is a per-type counter.
 * @param - Flat token array from `tokenize()` / `tokenizeOp()`
 * @param - The original text (used for offset extraction)
 * @returns Template string and slot mappings
 */
export const placeholderize = (tokens: Token[], originalText: string): PlaceholderResult
```

### `fillTemplate`

```ts
/**
 * Attempt to fill a translation template with values from a source mapping.
 *
 * Given:
 * - A translation template (e.g. "错误码：{NUM_0}")
 * - Translation slots from the stored memory
 * - Source slots from the current input text
 *
 * This replaces each placeholder in the translation template with the
 * corresponding value from the current source text's slots (matched by
 * placeholder name), falling back to the stored translation's original value.
 * @returns The filled translation string, or null if slots are incompatible.
 */
export const fillTemplate = (translationTemplate: string, translationSlots: PlaceholderSlot[], sourceSlots: PlaceholderSlot[]): string | null
```

### `slotsToMapping`

```ts
/**
 * Convert PlaceholderSlots to a serializable mapping for DB storage.
 */
export const slotsToMapping = (slots: PlaceholderSlot[]): SlotMappingEntry[]
```

### `mappingToSlots`

```ts
/**
 * Convert a stored slot mapping back to PlaceholderSlots.
 * Note: start/end offsets are not preserved in storage,
 * they are only needed at placeholderize time.
 */
export const mappingToSlots = (mapping: SlotMappingEntry[]): PlaceholderSlot[]
```

### `insertMemory`

```ts
export const insertMemory = async (tx: DbHandle, memoryIds: string[], translationIds: number[]): Promise<{ memoryItemIds: number[]; }>
```

### `mergeAlignmentOp`

```ts
/**
 * 多策略对齐结果融合
 *
 * 1. 将向量、统计、LLM 三路对齐结果按加权平均融合
 * 2. 通过 Union-Find 进行传递闭包，生成多语言术语组
 * 3. 冲突解决：同语言多候选保留连接度最高的候选
 */
export const mergeAlignmentOp = (data: MergeAlignmentInput): { alignedGroups: { terms: { languageId: string; text: string; normalizedText?: string | undefined; definition?: string | null | undefined; subjects?: string[] | null | undefined; stringId?: number | null | undefined; }[]; confidence: number; alignmentSources: ("statistical" | "llm" | "vector")[]; }[]; unaligned: { text: string; languageId: string; reason: string; }[]; stats: { totalInputTerms: number; totalAlignedGroups: number; vectorAlignments: number; statisticalAlignments: number; llmAlignments: number; }; }
```

### `nlpBatchSegmentOp`

```ts
/**
 * 批量文本 NLP 分词
 *
 * 通过 NLP_WORD_SEGMENTER 插件服务批量进行语言学分词。
 * 当没有可用的 NLP_WORD_SEGMENTER 插件时，自动回退到内置 Intl.Segmenter 逐条处理。
 */
export const nlpBatchSegmentOp = async (data: NlpBatchSegmentInput, ctx?: OperationContext): Promise<{ results: { id: string; result: { sentences: { text: string; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; start: number; end: number; }[]; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; }; }[]; }>
```

### `intlSegmenterFallback`

```ts
/**
 * 基于 Intl.Segmenter 的内嵌回退分词实现
 *
 * 在没有可用的 NLP_WORD_SEGMENTER 插件时自动调用。
 * 局限性：无 POS 标注（pos 设为 "X" 或 "PUNCT"/"NUM"）、无 lemma（lemma 等于 text 的小写形式）、
 * 停用词仅覆盖基础英文词汇。
 */
export const intlSegmenterFallback = (text: string, languageId: string): { sentences: { text: string; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; start: number; end: number; }[]; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; }
```

### `nlpSegmentOp`

```ts
/**
 * 单文本 NLP 分词
 *
 * 通过 NLP_WORD_SEGMENTER 插件服务进行语言学分词。
 * 当没有可用的 NLP_WORD_SEGMENTER 插件时，自动回退到内置 Intl.Segmenter。
 */
export const nlpSegmentOp = async (data: NlpSegmentInput, ctx?: OperationContext): Promise<{ sentences: { text: string; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; start: number; end: number; }[]; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; }>
```

### `parseFileOp`

```ts
/**
 * 解析文件内容为可翻译元素列表
 *
 * 通过 FILE_IMPORTER 插件解析文件，并补全 sortIndex。
 */
export const parseFileOp = async (data: ParseFileInput, _ctx?: OperationContext): Promise<{ elements: { text: string; sortIndex: number; languageId: string; meta: any; sourceStartLine?: number | null | undefined; sourceEndLine?: number | null | undefined; sourceLocationMeta?: any; }[]; }>
```

### `qaTranslationOp`

```ts
/**
 * 翻译质量检查
 *
 * 对指定翻译执行完整 QA 流程：
 * 1. 获取翻译文本、源文本及语言信息
 * 2. 查找相关术语（统一走后端）
 * 3. 并行对源文本和翻译文本进行分词（含术语标注）
 * 4. 创建 QA 结果记录
 * 5. 执行 QA 检查并持久化结果
 */
export const qaTranslationOp = async (payload: QaTranslationInput, ctx?: OperationContext): Promise<Record<string, never>>
```

### `qaOp`

```ts
/**
 * 质量检查
 *
 * 使用所有已注册的 QA_CHECKER 插件对源文本/翻译文本进行质量检查。
 */
export const qaOp = async (payload: QAInput, _ctx?: OperationContext): Promise<{ result: { meta: any; isPassed: boolean; checkerId: number; }[]; }>
```

### `registerDomainEventHandlers`

```ts
export const registerDomainEventHandlers = ()
```

### `retrieveEmbeddingsOp`

```ts
/**
 * 获取 chunk 的嵌入向量
 *
 * 从 VECTOR_STORAGE 插件中检索指定 chunk 的向量表示。
 */
export const retrieveEmbeddingsOp = async (data: RetrieveEmbeddingsInput, _ctx?: OperationContext): Promise<{ embeddings: number[][]; vectorStorageId: number; }>
```

### `revectorizeConceptOp`

```ts
/**
 * 重新向量化 termConcept 的结构化描述文本。
 *
 * 构建新的向量化文本 → 与 `translatableString.value` 比对 →
 * 相同则跳过（去重），否则向量化并更新 `termConcept.stringId`。
 */
export const revectorizeConceptOp = async (data: RevectorizeConceptInput, ctx?: OperationContext): Promise<{ skipped: boolean; }>
```

### `revectorizeOp`

```ts
/**
 * 重新向量化已有的 chunk
 *
 * 使用新的向量化器更新既有 chunk 的嵌入向量，
 * 适用于切换向量化模型后的数据迁移场景。
 */
export const revectorizeOp = async (payload: RevectorizeInput, _ctx?: OperationContext): Promise<Record<string, never>>
```

### `searchChunkOp`

```ts
/**
 * 向量 chunk 搜索
 *
 * 支持两种查询模式：
 * 1. 通过 queryChunkIds 从数据库检索已有嵌入向量
 * 2. 通过 queryVectors 直接传入原始向量（跳过 DB 查询）
 *
 * 然后在指定范围内进行余弦相似度搜索。
 */
export const searchChunkOp = async (payload: SearchChunkInput, ctx?: OperationContext): Promise<{ chunks: { chunkId: number; similarity: number; }[]; }>
```

### `searchMemoryOp`

```ts
/**
 * 搜索翻译记忆
 *
 * 在指定记忆库中通过向量相似度搜索匹配的翻译记忆。
 * 合并了原 workflow 的 dependencies（计算搜索范围）和 handler（处理结果）。
 */
export const searchMemoryOp = async (data: SearchMemoryInput, ctx?: OperationContext): Promise<{ memories: { id: number; translationChunkSetId: number; source: string; translation: string; memoryId: string; creatorId: string | null; confidence: number; createdAt: Date; updatedAt: Date; adaptedTranslation?: string | undefined; adaptationMethod?: "exact" | "token-replaced" | "llm-adapted" | undefined; }[]; }>
```

### `semanticSearchTermsOp`

```ts
/**
 * 语义术语搜索
 *
 * 将查询文本向量化后，在指定词汇表的已向量化 termConcept 中进行余弦相似度搜索，
 * 返回与查询语义相关的术语对列表。
 *
 * 要求每个目标 termConcept 已通过 {@link revectorizeConceptOp} 建立向量索引。
 * 若词汇表中尚无已向量化的概念，则返回空数组。
 */
export const semanticSearchTermsOp = async (data: SemanticSearchTermsInput, _ctx?: OperationContext): Promise<SemanticSearchTermsOutput>
```

### `statisticalTermAlignOp`

```ts
/**
 * 统计共现术语对齐
 *
 * 利用 CAT 系统天然的翻译对关系进行共现比对:
 * - 优先利用翻译对关系（translationId 级别）
 * - 若无翻译，回退到元素级共现（elementId 级别）
 */
export const statisticalTermAlignOp = async (data: StatisticalTermAlignInput, ctx?: OperationContext): Promise<{ alignedPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; coOccurrenceScore: number; }[]; }>
```

### `statisticalTermExtractOp`

```ts
/**
 * 统计学术语提取
 *
 * 内部调用 nlpBatchSegmentOp 进行 NLP 分词，然后通过 POS 过滤 + N-gram 生成
 * + TF-IDF + C-value 算法提取高置信度术语候选。
 */
export const statisticalTermExtractOp = async (data: StatisticalTermExtractInput, ctx?: OperationContext): Promise<{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; nlpSegmenterUsed: "plugin" | "intl-fallback"; }>
```

### `streamSearchMemoryOp`

```ts
/**
 * Three-channel streaming memory search.
 *
 * Returns an AsyncIterable that yields MemorySuggestion items as they arrive
 * from the three channels. Exact matches arrive first, followed by trgm,
 * then vector results.
 *
 * For non-exact results that have stored templates, attempts deterministic
 * placeholder replacement to produce an `adaptedTranslation`.
 */
export const streamSearchMemoryOp = (data: StreamSearchMemoryInput, ctx?: OperationContext): AsyncIterable<{ id: number; translationChunkSetId: number; source: string; translation: string; memoryId: string; creatorId: string | null; confidence: number; createdAt: Date; updatedAt: Date; adaptedTranslation?: string | undefined; adaptationMethod?: "exact" | "token-replaced" | "llm-adapted" | undefined; }>
```

### `streamSearchTermsOp`

```ts
/**
 * 组合术语搜索 — 双通道流式输出
 *
 * 同时启动两种搜索策略，结果通过 {@link AsyncMessageQueue} 以流的形式推送：
 *
 * 1. **ILIKE + word_similarity 词法匹配**（快）：基于 pg_trgm GIN 索引，几乎实时返回，先抵达。
 * 2. **向量语义搜索**（慢）：需要向量化查询文本，若插件不可用则自动跳过。
 *
 * 两路结果按 `(term text, conceptId)` 复合键全局去重（先到先得），保证调用方拿到的是唯一结果集。
 * 返回的 `AsyncIterable` 可直接用 `for await` 消费或在 oRPC `async function*` 中 yield。
 */
export const streamSearchTermsOp = (data: StreamSearchTermsInput, ctx?: OperationContext): AsyncIterable<{ term: string; translation: string; definition: string | null; conceptId: number; glossaryId: string; confidence: number; }>
```

### `termRecallOp`

```ts
export const termRecallOp = async (data: TermRecallInput, _ctx?: OperationContext): Promise<{ terms: { term: string; translation: string; definition: string | null; conceptId: number; glossaryId: string; confidence: number; concept: { subjects: { name: string; defaultDefinition: string | null; }[]; definition: string | null; }; }[]; }>
```

### `tokenizeOp`

```ts
/**
 * 文本分词
 *
 * 通过所有已注册的 TOKENIZER 插件按优先级分词。
 */
export const tokenizeOp = async (payload: TokenizeInput, ctx?: OperationContext): Promise<{ tokens: import("/workspaces/cat/packages/plugin-core/dist/index").Token[]; }>
```

### `triggerConceptRevectorize`

```ts
/**
 * 解析当前可用的 TEXT_VECTORIZER / VECTOR_STORAGE 插件，
 * 如果两者均就绪，则以 fire-and-forget 方式触发概念重向量化。
 *
 * 若任一插件不可用，则静默跳过（graceful degradation）。
 */
export const triggerConceptRevectorize = (conceptId: number, ctx?: OperationContext)
```

### `updateConceptOp`

```ts
/**
 * 更新 termConcept 的定义和/或 M:N 主题关联。
 *
 * 写入完成后由领域事件处理器自动触发概念重向量化。
 */
export const updateConceptOp = async (data: UpdateConceptInput, ctx?: OperationContext): Promise<{ updated: boolean; }>
```

### `upsertDocumentFromFileOp`

```ts
/**
 * 从文件更新文档
 *
 * 1. 解析文件获取元素列表
 * 2. 获取文档当前的旧元素
 * 3. 比较新旧元素并执行增删改
 */
export const upsertDocumentFromFileOp = async (data: UpsertDocumentInput, ctx?: OperationContext): Promise<{ success: boolean; addedCount: number; removedCount: number; }>
```

### `vectorTermAlignOp`

```ts
/**
 * 向量相似度术语对齐
 *
 * 1. 把每个候选术语（text + definition）向量化并创建正式 TranslatableString（Decision #4-C）
 * 2. 跨语言组进行两两余弦相似度对比
 * 3. 相似度 >= minSimilarity 的配对记录进 alignedPairs
 */
export const vectorTermAlignOp = async (data: VectorTermAlignInput, ctx?: OperationContext): Promise<{ alignedPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; similarity: number; }[]; stringIds: { groupIndex: number; candidateIndex: number; stringId: number; }[]; }>
```

### `vectorizeToChunkSetOp`

```ts
/**
 * 向量化文本并存储 ChunkSet
 *
 * 使用 TEXT_VECTORIZER 插件将文本转为向量，
 * 创建 ChunkSet/Chunk 行并通过 VECTOR_STORAGE 插件持久化向量。
 */
export const vectorizeToChunkSetOp = async ({ data, vectorStorageId, vectorizerId }: VectorizeInput, ctx?: OperationContext): Promise<{ chunkSetIds: number[]; }>
```

## Type Index

* `AdaptMemoryInput` (type)

* `AdaptMemoryOutput` (type)

* `AddTermToConceptInput` (type)

* `AddTermToConceptOutput` (type)

* `AutoTranslateInput` (type)

* `AutoTranslateOutput` (type)

* `CreateElementInput` (type)

* `CreateElementOutput` (type)

* `CreateTermInput` (type)

* `CreateTermOutput` (type)

* `CreateTranslatableStringInput` (type)

* `CreateTranslatableStringOutput` (type)

* `CreateTranslationInput` (type)

* `CreateTranslationOutput` (type)

* `CreateTranslationPubPayload` (type)

* `DeduplicateAndMatchInput` (type)

* `DeduplicateAndMatchOutput` (type)

* `DeleteTermInput` (type)

* `DeleteTermOutput` (type)

* `DiffElementsInput` (type)

* `DiffElementsOutput` (type)

* `FetchAdviseInput` (type)

* `FetchAdviseOutput` (type)

* `LlmRefineTranslationInput` (type)

* `LlmRefineTranslationOutput` (type)

* `LlmTermAlignInput` (type)

* `LlmTermAlignOutput` (type)

* `LlmTermEnhanceInput` (type)

* `LlmTermEnhanceOutput` (type)

* `LoadElementTextsInput` (type)

* `LoadElementTextsOutput` (type)

* `LookupTermsInput` (type)

* `LookupTermsOutput` (type)

* `PlaceholderSlot` (interface)

* `PlaceholderResult` (interface)

* `SlotMappingEntry` (interface) — JSON-serializable slot mapping for database storage.

* `MergeAlignmentInput` (type)

* `MergeAlignmentOutput` (type)

* `NlpBatchSegmentInput` (type)

* `NlpBatchSegmentOutput` (type)

* `NlpSegmentInput` (type)

* `NlpSegmentOutput` (type)

* `ParseFileInput` (type)

* `ParseFileOutput` (type)

* `QaTranslationInput` (type)

* `QaTranslationOutput` (type)

* `QAInput` (type)

* `QAOutput` (type)

* `RetrieveEmbeddingsInput` (type)

* `RetrieveEmbeddingsOutput` (type)

* `RevectorizeConceptInput` (type)

* `RevectorizeConceptOutput` (type)

* `RevectorizeInput` (type)

* `RevectorizeOutput` (type)

* `SearchChunkInput` (type)

* `SearchChunkOutput` (type)

* `SearchMemoryInput` (type)

* `SearchMemoryOutput` (type)

* `SemanticSearchTermsInput` (type)

* `SemanticSearchTermsOutput` (type)

* `StatisticalTermAlignInput` (type)

* `StatisticalTermAlignOutput` (type)

* `StatisticalTermExtractInput` (type)

* `StatisticalTermExtractOutput` (type)

* `StreamSearchMemoryInput` (type)

* `StreamSearchTermsInput` (type)

* `TermRecallInput` (type)

* `TermContext` (type)

* `TermRecallOutput` (type)

* `TokenizeInput` (type)

* `TokenizeOutput` (type)

* `UpdateConceptInput` (type)

* `UpdateConceptOutput` (type)

* `UpsertDocumentInput` (type)

* `UpsertDocumentOutput` (type)

* `VectorTermAlignInput` (type)

* `VectorTermAlignOutput` (type)

* `VectorizeInput` (type)

* `VectorizeOutput` (type)
