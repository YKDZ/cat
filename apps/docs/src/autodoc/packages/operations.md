# @cat/operations

Operations layer: business workflows composing domain operations

## Overview

* **Modules**: 76

* **Exported functions**: 91

* **Exported types**: 111

## Function Index

### packages/operations/src

### `addTermToConceptOp`

```ts
/**
 * Add a term entry to an existing termConcept.
 *
 * After the write completes, the domain event handler automatically
 * triggers concept re-vectorization (term list changes affect the vectorization text).
 *
 * @param data - Term entry data to write
 * @param ctx - Operation context
 *
 * @returns ID of the newly created term
 */
export const addTermToConceptOp = async (data: AddTermToConceptInput, ctx?: OperationContext): Promise<{ termId: number; }>
```

### `autoTranslateOp`

```ts
/**
 * Auto-translate a translatable element.
 *
 * Fetches machine-translation suggestions and memory matches in parallel,
 * then applies a priority rule to pick the best candidate and create a
 * translation record. Priority: memory > MT suggestion.
 * Returns `{}` when no candidate is available.
 *
 * @param data - Auto-translation input parameters
 * @param ctx - Operation context
 *
 * @returns List of created translation IDs, empty when no match was found
 */
export const autoTranslateOp = async (data: AutoTranslateInput, ctx?: OperationContext): Promise<{ translationIds?: number[] | undefined; }>
```

### `buildMemoryRecallVariantsOp`

```ts
/**
 * Build recall variants for a single memory item and persist them.
 *
 * SOURCE side variants:
 *   - SURFACE: exact source text
 *   - CASE_FOLDED: lowercased
 *   - LEMMA: joined lemmas (when NLP tokens available)
 *   - TOKEN_TEMPLATE: canonical source template (placeholder form)
 *   - FRAGMENT: content tokens joined (stop words stripped)
 *
 * TRANSLATION side variants:
 *   - SURFACE: exact translation text
 *   - CASE_FOLDED: lowercased
 */
export const buildMemoryRecallVariantsOp = async (data: BuildMemoryRecallVariantsInput, ctx?: OperationContext, db?: DbHandle): Promise<void>
```

### `buildTermRecallVariantsOp`

```ts
/**
 * Build and persist recall variants for a single concept.
 *
 * Variant types produced:
 * - SURFACE: exact original text
 * - CASE_FOLDED: lowercased text
 * - LEMMA: joined lemmas (when NLP tokens provided)
 *
 * For multi-word terms a limited lemma window is also stored (windowSize in meta).
 */
export const buildTermRecallVariantsOp = async (data: BuildTermRecallVariantsInput, ctx?: OperationContext): Promise<void>
```

### `collectMemoryRecallOp`

```ts
/**
 * Aggregated memory recall — multi-channel evidence merge.
 *
 * Channels (in order of speed):
 * 1. Exact match (fastest)
 * 2. trgm similarity
 * 3. Variant-based (morphological / template / fragment)
 *
 * All results are globally deduplicated by `memoryItem.id`, keeping the
 * highest confidence across all channels. Evidence from multiple channels
 * is merged onto the winning result.
 */
export const collectMemoryRecallOp = async (data: CollectMemoryRecallInput, ctx?: OperationContext): Promise<MemorySuggestionWithPrecision[]>
```

### `collectTermRecallOp`

```ts
export const collectTermRecallOp = async (data: CollectTermRecallInput, ctx?: OperationContext): Promise<LookedUpTermWithPrecision[]>
```

### `createElementOp`

```ts
/**
 * Create translatable elements.
 *
 * First creates TranslatableStrings (with vectorization), then inserts
 * the corresponding TranslatableElement rows.
 *
 * @param data - Element creation input parameters
 * @param ctx - Operation context
 *
 * @returns List of IDs of the newly created elements
 */
export const createElementOp = async (data: CreateElementInput, ctx?: OperationContext): Promise<{ elementIds: number[]; }>
```

### `createTermOp`

```ts
/**
 * Create term entries.
 *
 * Directly stores term text (text + languageId), then builds the
 * structured vectorization text for each termConcept and vectorizes it.
 *
 * @param data - Term creation input parameters
 * @param ctx - Operation context
 *
 * @returns List of IDs of the newly created terms
 */
export const createTermOp = async (data: CreateTermInput, ctx?: OperationContext): Promise<{ termIds: number[]; }>
```

### `createTranslationOp`

```ts
/**
 * Create translation records.
 *
 * 1. Create translatable strings (enqueue vectorization when services are available)
 * 2. Insert translation records
 * 3. Trigger optional publish notification via domain event
 * 4. Optionally write to translation memory
 * 5. Run QA checks for every created translation
 *
 * @param data - Translation creation input parameters
 * @param ctx - Operation context
 *
 * @returns List of created translation IDs and memory item IDs
 */
export const createTranslationOp = async (data: CreateTranslationInput, ctx?: OperationContext): Promise<{ translationIds: number[]; memoryItemIds: number[]; }>
```

### `createVectorizedStringOp`

```ts
/**
 * Create vectorized strings and enqueue background vectorization when vector services are available.
 *
 * Inserts VectorizedString rows (status=PENDING_VECTORIZE) into the database first,
 * and only enqueues the vectorization task plus publishes a domain event when both
 * `vectorizerId` and `vectorStorageId` are available. Otherwise it only creates the
 * string records and leaves later re-vectorization to follow-up flows.
 *
 * @param data - String creation input parameters
 * @param ctx - Operation context
 *
 * @returns List of IDs of the newly created strings
 */
export const createVectorizedStringOp = async (data: CreateVectorizedStringInput, ctx?: OperationContext): Promise<{ stringIds: number[]; }>
```

### `deduplicateAndMatchOp`

```ts
/**
 * Deduplicate term candidates and match against the existing glossary.
 *
 * 1. Normalize-deduplicate candidates by normalizedText (lemma) as the aggregation key
 * 2. Batch-compare against the existing glossary via the recall variant existence query
 * 3. Mark candidates that already exist in the glossary
 *
 * @param data - Deduplication and match input parameters
 * @param _ctx - Operation context (unused)
 *
 * @returns Deduplicated candidates annotated with glossary existence flags
 */
export const deduplicateAndMatchOp = async (data: DeduplicateAndMatchInput, _ctx?: OperationContext): Promise<{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; source: "statistical" | "llm" | "both"; existsInGlossary: boolean; existingConceptId: number | null; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; }>
```

### `deleteTermOp`

```ts
/**
 * Delete a term entry.
 *
 * After deletion, the domain event handler automatically triggers
 * concept re-vectorization.
 *
 * @param data - Input parameters containing the term ID to delete
 * @param ctx - Operation context
 *
 * @returns Whether deletion succeeded and the associated concept ID
 */
export const deleteTermOp = async (data: DeleteTermInput, ctx?: OperationContext): Promise<{ deleted: boolean; conceptId: number | null; }>
```

### `diffElementsOp`

```ts
/**
 * Compare old and new elements and apply additions, deletions, and updates.
 *
 * 1. Fetch old elements
 * 2. Match old and new elements by meta
 * 3. Process text updates, sort-index updates, and position updates
 * 4. Create newly added elements
 * 5. Delete removed elements
 *
 * @param data - Diff input parameters
 * @param ctx - Operation context
 *
 * @returns IDs of added elements, removed elements, and the document
 */
export const diffElementsOp = async (data: DiffElementsInput, ctx?: OperationContext): Promise<{ addedElementIds: number[]; removedElementIds: number[]; documentId: string; }>
```

### `fetchAdviseOp`

```ts
/**
 * Fetch machine-translation suggestions.
 *
 * Queries the TRANSLATION_ADVISOR plugin service for MT suggestions,
 * with optional glossary term injection, translation memory context,
 * and element metadata. Upstream callers can pass preloaded terms/memories
 * via `preloadedTerms` / `preloadedMemories` to skip internal DB queries.
 *
 * @param data - Translation advice input parameters
 * @param ctx - Operation context
 *
 * @returns Sorted list of translation suggestions
 */
export const fetchAdviseOp = async (data: FetchAdviseInput, ctx?: OperationContext): Promise<{ suggestions: { translation: string; confidence: number; meta?: any; }[]; }>
```

### `fetchBestTranslationCandidateOp`

```ts
/**
 * Fetch the best translation candidate by running advisor + memory recall
 * in parallel and picking the highest-confidence result. Memory > advisor.
 * Individual provider failures are silently suppressed.
 */
export const fetchBestTranslationCandidateOp = async (rawData: FetchBestTranslationCandidateInput, ctx?: OperationContext): Promise<{ text: string; confidence: number; source: "memory" | "advisor"; memoryId?: string | undefined; } | null>
```

### `findOrCreateAutoTranslatePR`

```ts
/**
 * Find or create an AutoTranslate PR for the given language.
 * Concurrency safety is ensured by a partial unique index on the pullRequest table.
 * On conflict, re-query the existing PR.
 */
export const findOrCreateAutoTranslatePR = async (ctx: { db: DbHandle }, input: FindOrCreateAutoTranslatePRInput): Promise<FindOrCreateAutoTranslatePRResult>
```

### `llmRefineTranslationOp`

```ts
/**
 * Post-edit a translation using an LLM.
 *
 * Sends the candidate translation and glossary context to the LLM,
 * requiring it to use the given terms strictly, preserve the source meaning,
 * and maintain consistency with neighboring translations.
 * Returns the candidate unchanged when no LLM_PROVIDER is available.
 *
 * @param data - LLM post-editing input parameters
 * @param ctx - Operation context
 *
 * @returns Refined translation text and a flag indicating whether refinement was applied
 */
export const llmRefineTranslationOp = async (data: LlmRefineTranslationInput, ctx?: OperationContext): Promise<{ refinedText: string; refined: boolean; }>
```

### `llmTermAlignOp`

```ts
/**
 * LLM term alignment (fallback strategy).
 *
 * Uses the LLM to judge candidate pairs that vector-based and
 * statistical alignment could not resolve with high confidence.
 * Internally batches LLM calls (default 30 pairs per batch).
 *
 * @param data - LLM alignment input parameters
 * @param ctx - Operation context
 *
 * @returns Term pairs judged as aligned by the LLM with their confidence scores
 */
export const llmTermAlignOp = async (data: LlmTermAlignInput, ctx?: OperationContext): Promise<{ alignedPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; llmScore: number; }[]; }>
```

### `llmTermEnhanceOp`

```ts
/**
 * Enhance term candidates using an LLM.
 *
 * Validates low-confidence candidates via the LLM to determine whether
 * they are genuine terms, and batch-generates definitions and subjects.
 *
 * - High-confidence candidates (>= confidenceThreshold) retain statistical
 * results; only definition/subject is generated.
 * - Low-confidence candidates require LLM validation before being kept.
 *
 * @param data - LLM term enhancement input parameters
 * @param ctx - Operation context
 *
 * @returns Enhanced candidate list and the count of newly added LLM candidates
 */
export const llmTermEnhanceOp = async (data: LlmTermEnhanceInput, ctx?: OperationContext): Promise<{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; source: "statistical" | "llm" | "both"; existsInGlossary: boolean; existingConceptId: number | null; definition: string | null; subjects: string[] | null; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; llmCandidatesAdded: number; }>
```

### `deriveLlmTranslateConfidence`

```ts
/**
 * Derive a confidence score for an LLM translation suggestion.
 *
 * Base score from memory match confidence, plus fixed bonuses per context signal present.
 * Hard cap at 0.85, rounded to 4 decimal places.
 *
 * @param ctx - Confidence context signals
 *
 * @returns Confidence score between 0 and 0.85
 */
export const deriveLlmTranslateConfidence = (ctx: ConfidenceContext): number
```

### `llmTranslateOp`

```ts
/**
 * Built-in LLM Translation Suggestion (first-party suggestion source).
 *
 * Self-loads element info, neighbor translations, element contexts, element metadata,
 * approved translations, and comments via domain queries. Combines with
 * caller-provided memory recall and term recall results, then calls the LLM
 * once to produce a translation suggestion.
 *
 * Returns `{ suggestion: null }` when:
 * - No LLM_PROVIDER is available
 * - The LLM call fails
 * - The element is not found
 * - Database access fails
 *
 * @param data - LLM translate input
 * @param ctx - Operation context
 */
export const llmTranslateOp = async (data: LlmTranslateInput, ctx?: OperationContext): Promise<{ suggestion: { translation: string; confidence: number; meta?: { source: "llm-translate"; signalClasses: ("source" | "term" | "memory" | "neighborTranslations" | "elementMeta" | "elementContexts" | "approvedTranslations" | "comments")[]; } | undefined; } | null; }>
```

### `loadElementTextsOp`

```ts
/**
 * Batch load element texts.
 *
 * Loads TranslatableElements and their TranslatableString.value in bulk
 * by documentIds or elementIds, returning a normalized list.
 *
 * @param data - Load input; accepts documentIds or elementIds
 * @param _ctx - Operation context (unused)
 *
 * @returns Normalized list of element texts
 */
export const loadElementTextsOp = async (data: LoadElementTextsInput, _ctx?: OperationContext): Promise<{ elements: { elementId: number; text: string; languageId: string; }[]; }>
```

### `lookupTermsForElementOp`

```ts
/**
 * Look up relevant terms for a translatable element from the backend.
 *
 * Reuses the query chain from the glossary.findTerm route:
 * element → document → project → glossaryIds → lexical term query.
 * Uses ILIKE + word_similarity for term matching (no semantic search).
 *
 * @param elementId - Translatable element ID
 * @param translationLanguageId - Target language ID
 * @param _ctx - Operation context (unused)
 *
 * @returns List of matched term data entries
 */
export const lookupTermsForElementOp = async (elementId: number, translationLanguageId: string, _ctx?: OperationContext): Promise<{ term: string; termLanguageId: string; translation: string; translationLanguageId: string; definition?: string | null | undefined; subjectIds?: number[] | null | undefined; conceptId?: number | null | undefined; glossaryId?: string | null | undefined; }[]>
```

### `compressBm25Score`

```ts
export function compressBm25Score(rawScore: number, _profile: "bm25-ratio-k1-v1"): number
```

### `buildMemoryRecallBm25Capabilities`

```ts
export function buildMemoryRecallBm25Capabilities(fullCatalog: string[], filterLanguageIds?: string[]): { languageId: string; enabled: boolean; textSearchConfig: string | null; tokenizerLabel: string | null; compressionProfile: "bm25-ratio-k1-v1" | null; disabledReason: string | null; }[]
```

### `collectBm25MemorySuggestionsOp`

```ts
export async function collectBm25MemorySuggestionsOp(input: { text: string; sourceLanguageId: string; translationLanguageId: string; memoryIds: string[]; maxAmount: number; }, drizzle: import("drizzle-orm/node-postgres").NodePgDatabase<import("@cat/db").DrizzleSchema, import("drizzle-orm").EmptyRelations> & { $client: import("pg").Client; }): Promise<RawMemorySuggestion[]>
```

### `placeholderize`

```ts
/**
 * Convert a flat token sequence into a placeholder template.
 *
 * All token types except `text`, `unknown`, and whitespace-like types
 * are replaced with `{TYPE_N}` placeholders where N is a per-type counter.
 *
 * @param tokens - Flat token array from `tokenize()` / `tokenizeOp()`
 * @param originalText - The original text (used for offset extraction)
 *
 * @returns Template string and slot mappings
 */
export const placeholderize = (tokens: Token[], originalText: string): PlaceholderResult
```

### `fillTemplate`

```ts
/**
 * Attempt to fill a translation template with values from a source mapping.
 *
 * Given a translation template, translation slots from the stored memory,
 * and source slots from the current input text, replaces each placeholder
 * in the translation template with the corresponding value from the current
 * source text's slots (matched by placeholder name), falling back to the
 * stored translation's original value.
 *
 * @param translationTemplate - Placeholderized translation template
 * @param translationSlots - Translation slots from the stored memory item
 * @param sourceSlots - Slots from the current input source text
 *
 * @returns Filled translation string, or `null` when slots are incompatible
 */
export const fillTemplate = (translationTemplate: string, translationSlots: PlaceholderSlot[], sourceSlots: PlaceholderSlot[]): string | null
```

### `slotsToMapping`

```ts
/**
 * Convert PlaceholderSlots to a serializable mapping for DB storage.
 *
 * @param slots - List of placeholder slots
 *
 * @returns Serializable slot mapping list
 */
export const slotsToMapping = (slots: PlaceholderSlot[]): SlotMappingEntry[]
```

### `mappingToSlots`

```ts
/**
 * Convert a stored slot mapping back to PlaceholderSlots.
 *
 * Note: `start`/`end` offsets are not preserved in storage;
 * they are set to 0 after restoration.
 *
 * @param mapping - Stored slot mapping list
 *
 * @returns Restored PlaceholderSlot list
 */
export const mappingToSlots = (mapping: SlotMappingEntry[]): PlaceholderSlot[]
```

### `insertMemory`

```ts
/**
 * Write translations into the specified translation memory banks.
 *
 * For each translation, generates source and translation templates via
 * tokenization and placeholderization (templates are only stored when
 * placeholders are present). Tokenization failures are non-fatal;
 * the memory item will be inserted without a template.
 *
 * @param tx - Database transaction handle
 * @param memoryIds - List of target memory bank UUIDs
 * @param translationIds - List of translation IDs to store
 *
 * @returns List of created memory item IDs
 */
export const insertMemory = async (tx: DbHandle, memoryIds: string[], translationIds: number[]): Promise<{ memoryItemIds: number[]; }>
```

### `mergeAlignmentOp`

```ts
/**
 * Merge multi-strategy alignment results.
 *
 * 1. Fuse vector, statistical, and LLM alignment pairs via weighted-average scores
 * 2. Apply Union-Find transitive closure to form multilingual term groups
 * 3. Conflict resolution: when multiple candidates exist for the same language,
 * keep the one with the highest connectivity
 *
 * @param data - Merge input parameters
 *
 * @returns Aligned groups, unaligned candidates, and alignment statistics
 */
export const mergeAlignmentOp = (data: MergeAlignmentInput): { alignedGroups: { terms: { languageId: string; text: string; normalizedText?: string | undefined; definition?: string | null | undefined; subjects?: string[] | null | undefined; stringId?: number | null | undefined; }[]; confidence: number; alignmentSources: ("statistical" | "llm" | "vector")[]; }[]; unaligned: { text: string; languageId: string; reason: string; }[]; stats: { totalInputTerms: number; totalAlignedGroups: number; vectorAlignments: number; statisticalAlignments: number; llmAlignments: number; }; }
```

### `mergePRFull`

```ts
/**
 * Full PR merge operation: conflict detection → entry copy to main → entity changes (full rollback) → status update.
 * Executed in a single database transaction; any step failure triggers full rollback.
 */
export const mergePRFull = async (ctx: DbContext, input: MergePRFullInput): Promise<MergePRFullResult>
```

### `nlpBatchSegmentOp`

```ts
/**
 * Batch NLP segmentation of texts.
 *
 * Performs linguistic word segmentation in batch mode via the
 * NLP_WORD_SEGMENTER plugin service. When no plugin is available,
 * automatically falls back to the built-in Intl.Segmenter, processing
 * items one by one.
 *
 * @param data - Batch segmentation input parameters
 * @param ctx - Operation context
 *
 * @returns Per-item segmentation results containing sentence and token lists
 */
export const nlpBatchSegmentOp = async (data: NlpBatchSegmentInput, ctx?: OperationContext): Promise<{ results: { id: string; result: { sentences: { text: string; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; start: number; end: number; }[]; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; }; }[]; }>
```

### `intlSegmenterFallback`

```ts
/**
 * Built-in fallback segmentation based on Intl.Segmenter.
 *
 * Called automatically when no NLP_WORD_SEGMENTER plugin is available.
 * Limitations: no POS tagging (pos set to "X" or "PUNCT"/"NUM"), no
 * lemmatization (lemma equals the lowercased text), and stop-word
 * coverage is limited to basic English vocabulary.
 *
 * @param text - Text to segment
 * @param languageId - BCP 47 language identifier used to configure Intl.Segmenter
 *
 * @returns Segmentation result containing sentence and token lists
 */
export const intlSegmenterFallback = (text: string, languageId: string): { sentences: { text: string; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; start: number; end: number; }[]; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; }
```

### `isCjkLanguage`

```ts
export const isCjkLanguage = (languageId: string): boolean
```

### `joinTokens`

```ts
export const joinTokens = (tokens: NlpToken[], languageId: string): string
```

### `joinLemmas`

```ts
export const joinLemmas = (tokens: NlpToken[], languageId: string): string
```

### `buildTokenWindows`

```ts
export const buildTokenWindows = (tokens: NlpToken[], languageId: string, maxWindowSize: number): TokenWindow[]
```

### `nlpSegmentOp`

```ts
/**
 * Single-text NLP segmentation.
 *
 * Performs linguistic word segmentation via the NLP_WORD_SEGMENTER
 * plugin service. When no plugin is available, automatically falls
 * back to the built-in Intl.Segmenter.
 *
 * @param data - Segmentation input parameters
 * @param ctx - Operation context
 *
 * @returns Segmentation result containing sentence and token lists
 */
export const nlpSegmentOp = async (data: NlpSegmentInput, ctx?: OperationContext): Promise<{ sentences: { text: string; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; start: number; end: number; }[]; tokens: { text: string; lemma: string; pos: string; start: number; end: number; isStop: boolean; isPunct: boolean; }[]; }>
```

### `parseFileOp`

```ts
/**
 * Parse file content into a list of translatable elements.
 *
 * Parses the file via the FILE_IMPORTER plugin, then fills in the
 * sortIndex for each element.
 *
 * @param data - Parse input parameters (file ID and language ID)
 * @param _ctx - Operation context (unused)
 *
 * @returns Parsed list of translatable elements
 */
export const parseFileOp = async (data: ParseFileInput, _ctx?: OperationContext): Promise<{ elements: { text: string; sortIndex: number; languageId: string; meta: any; sourceStartLine?: number | null | undefined; sourceEndLine?: number | null | undefined; sourceLocationMeta?: any; }[]; }>
```

### `qaTranslationOp`

```ts
/**
 * Run the full QA pipeline for a specific translation.
 *
 * 1. Fetch the translation text, source text, and language information
 * 2. Look up relevant terms (via backend query chain)
 * 3. Tokenize source and translation texts in parallel (with term annotations)
 * 4. Run QA checks
 * 5. Persist QA results
 *
 * @param payload - QA input parameters (translation ID)
 * @param ctx - Operation context
 *
 * @returns Empty object (results are persisted directly to the database)
 */
export const qaTranslationOp = async (payload: QaTranslationInput, ctx?: OperationContext): Promise<Record<string, never>>
```

### `qaOp`

```ts
/**
 * Quality check.
 *
 * Runs all registered QA_CHECKER plugin services against the source
 * text and translation text.
 *
 * @param payload - QA input containing source text, translation text, and glossary IDs
 * @param _ctx - Operation context (unused)
 *
 * @returns List of check results from each QA checker
 */
export const qaOp = async (payload: QAInput, _ctx?: OperationContext): Promise<{ result: { meta: any; isPassed: boolean; checkerId: number; }[]; }>
```

### `rebasePRFull`

```ts
/**
 * Full PR rebase operation: baseline move → conflict detection → branch status sync.
 */
export const rebasePRFull = async (ctx: DbContext, input: RebasePRFullInput): Promise<RebasePRFullResult>
```

### `recallContextRerankOp`

```ts
export const recallContextRerankOp = async (data: RecallContextRerankInput, ctx?: OperationContext): Promise<{ id: number; translationChunkSetId: number | null; source: string; translation: string; memoryId: string; creatorId: string | null; confidence: number; createdAt: Date; updatedAt: Date; evidences: { channel: "exact" | "template" | "trgm" | "lexical" | "morphological" | "sparse" | "fragment" | "bm25" | "semantic"; confidence: number; matchedText?: string | undefined; matchedVariantText?: string | undefined; matchedVariantType?: string | undefined; note?: string | undefined; }[]; adaptedTranslation?: string | undefined; adaptationMethod?: "exact" | "token-replaced" | "llm-adapted" | undefined; matchedText?: string | undefined; matchedVariantText?: string | undefined; matchedVariantType?: string | undefined; }[]>
```

### `rerankTermRecallOp`

```ts
export const rerankTermRecallOp = async (data: TermRecallContextRerankInput, ctx?: OperationContext): Promise<{ term: string; translation: string; definition: string | null; conceptId: number; glossaryId: string; confidence: number; evidences: { channel: "exact" | "template" | "trgm" | "lexical" | "morphological" | "sparse" | "fragment" | "bm25" | "semantic"; confidence: number; matchedText?: string | undefined; matchedVariantText?: string | undefined; matchedVariantType?: string | undefined; note?: string | undefined; }[]; concept: { subjects: { name: string; defaultDefinition: string | null; }[]; definition: string | null; }; matchedText?: string | undefined; }[]>
```

### `registerDomainEventHandlers`

```ts
/**
 * Register domain event handlers (global singleton).
 *
 * Subscribes to the following domain events:
 * - `concept:updated` → triggers concept re-vectorization
 * - `project:created` → grants owner permission to the creator
 * - `glossary:created` → grants owner permission to the creator
 * - `memory:created` → grants owner permission to the creator
 * - `comment:created` → notifies the translation author of new comment
 * - `pr:merged` → auto-closes linked issue if present
 *
 * Idempotent: repeated calls are no-ops.
 */
export const registerDomainEventHandlers = (db: DrizzleClient, options?: { pluginManager?: PluginManager })
```

### `registerVectorizationConsumer`

```ts
/**
 * Register the vectorization queue consumer. Event-driven + startup recovery.
 */
export const registerVectorizationConsumer = async (queue: TaskQueue<VectorizationTask>, options?: { batchSize?: number }): Promise<void>
```

### `retrieveEmbeddingsOp`

```ts
/**
 * Retrieve embedding vectors for the given chunks.
 *
 * Fetches vector representations for the specified chunk IDs from
 * the VECTOR_STORAGE plugin.
 *
 * @param data - Input parameters containing the chunk IDs to retrieve
 * @param _ctx - Operation context (unused)
 *
 * @returns List of embedding vectors and the vector storage plugin ID
 */
export const retrieveEmbeddingsOp = async (data: RetrieveEmbeddingsInput, _ctx?: OperationContext): Promise<{ embeddings: number[][]; vectorStorageId: number; }>
```

### `revectorizeConceptOp`

```ts
/**
 * Re-vectorize the structured description text of a termConcept.
 *
 * Builds the new vectorization text, compares it with the existing
 * `translatableString.value`, skips when unchanged (dedup), otherwise
 * vectorizes and updates `termConcept.stringId`.
 *
 * @param data - Re-vectorization input parameters
 * @param ctx - Operation context
 *
 * @returns Whether the operation was skipped (text unchanged or concept not found)
 */
export const revectorizeConceptOp = async (data: RevectorizeConceptInput, ctx?: OperationContext): Promise<{ skipped: boolean; }>
```

### `revectorizeOp`

```ts
/**
 * Re-vectorize existing chunks.
 *
 * Updates the embedding vectors of existing chunks using a new
 * vectorizer. Intended for data migration when switching vectorization
 * models.
 *
 * @param payload - Re-vectorization input parameters
 * @param _ctx - Operation context (unused)
 *
 * @returns Empty object
 */
export const revectorizeOp = async (payload: RevectorizeInput, _ctx?: OperationContext): Promise<Record<string, never>>
```

### `runAutoTranslatePipeline`

```ts
/**
 * Pre-translation pipeline: check project settings, then for each enabled
 * language generate candidates and write them to a changeset.
 */
export const runAutoTranslatePipeline = async (ctx: { db: DbHandle }, input: RunAutoTranslatePipelineInput): Promise<void>
```

### `searchChunkOp`

```ts
/**
 * Vector chunk search.
 *
 * Supports two query modes:
 * 1. Retrieve existing embeddings from the database by queryChunkIds
 * 2. Pass raw vectors directly via queryVectors (skips DB lookup)
 *
 * Then performs cosine-similarity search within the specified chunk ID range.
 *
 * @param payload - Search input parameters
 * @param ctx - Operation context
 *
 * @returns List of matching chunks with their similarity scores
 */
export const searchChunkOp = async (payload: SearchChunkInput, ctx?: OperationContext): Promise<{ chunks: { chunkId: number; similarity: number; }[]; }>
```

### `searchMemoryOp`

```ts
/**
 * Search translation memory.
 *
 * Searches for matching translation memory entries within the specified
 * memory banks via vector similarity. Supports two query modes:
 * lookups by chunkIds (pre-stored embeddings) or queryVectors (raw vectors).
 *
 * @param data - Memory search input parameters
 * @param ctx - Operation context
 *
 * @returns List of matching memory entries (sorted by confidence descending)
 */
export const searchMemoryOp = async (data: SearchMemoryInput, ctx?: OperationContext): Promise<{ memories: { id: number; translationChunkSetId: number | null; source: string; translation: string; memoryId: string; creatorId: string | null; confidence: number; createdAt: Date; updatedAt: Date; evidences: { channel: "exact" | "template" | "trgm" | "lexical" | "morphological" | "sparse" | "fragment" | "bm25" | "semantic"; confidence: number; matchedText?: string | undefined; matchedVariantText?: string | undefined; matchedVariantType?: string | undefined; note?: string | undefined; }[]; adaptedTranslation?: string | undefined; adaptationMethod?: "exact" | "token-replaced" | "llm-adapted" | undefined; matchedText?: string | undefined; matchedVariantText?: string | undefined; matchedVariantType?: string | undefined; }[]; }>
```

### `semanticSearchTermsOp`

```ts
/**
 * Semantic term search.
 *
 * Vectorizes the query text on the fly and performs cosine-similarity
 * search against the vectorized termConcepts in the specified glossaries,
 * returning term pairs semantically related to the query.
 *
 * Requires each target termConcept to have a vector index built via
 * {
 *
 * @param data - Semantic search input parameters
 * @param _ctx - Operation context (unused)
 *
 * @returns Semantically related term matches
 */
export const semanticSearchTermsOp = async (data: SemanticSearchTermsInput, _ctx?: OperationContext): Promise<SemanticSearchTermsOutput>
```

### `statisticalTermAlignOp`

```ts
/**
 * Statistical co-occurrence term alignment.
 *
 * Exploits the natural translation-pair relationships in the CAT
 * system for co-occurrence comparison:
 * - Preferentially uses translation-pair relationships (translationId level)
 * - Falls back to element-level co-occurrence (elementId level) when
 * no translations exist
 *
 * @param data - Statistical alignment input parameters
 * @param ctx - Operation context
 *
 * @returns Aligned term pairs with their co-occurrence scores
 */
export const statisticalTermAlignOp = async (data: StatisticalTermAlignInput, ctx?: OperationContext): Promise<{ alignedPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; coOccurrenceScore: number; }[]; }>
```

### `statisticalTermExtractOp`

```ts
/**
 * Statistical term extraction.
 *
 * Internally calls {
 *
 * @param data - Statistical extraction input parameters
 * @param ctx - Operation context
 *
 * @returns Extracted term candidates and the segmenter type used
 */
export const statisticalTermExtractOp = async (data: StatisticalTermExtractInput, ctx?: OperationContext): Promise<{ candidates: { text: string; normalizedText: string; posPattern: string[]; confidence: number; frequency: number; documentFrequency: number; occurrences: { elementId: number; ranges: { start: number; end: number; }[]; }[]; }[]; nlpSegmenterUsed: "plugin" | "intl-fallback"; }>
```

### `streamSearchMemoryOp`

```ts
/**
 * Streaming memory search backed by the aggregated recall helper.
 */
export const streamSearchMemoryOp = (data: StreamSearchMemoryInput, ctx?: OperationContext): AsyncIterable<{ id: number; translationChunkSetId: number | null; source: string; translation: string; memoryId: string; creatorId: string | null; confidence: number; createdAt: Date; updatedAt: Date; evidences: { channel: "exact" | "template" | "trgm" | "lexical" | "morphological" | "sparse" | "fragment" | "bm25" | "semantic"; confidence: number; matchedText?: string | undefined; matchedVariantText?: string | undefined; matchedVariantType?: string | undefined; note?: string | undefined; }[]; adaptedTranslation?: string | undefined; adaptationMethod?: "exact" | "token-replaced" | "llm-adapted" | undefined; matchedText?: string | undefined; matchedVariantText?: string | undefined; matchedVariantType?: string | undefined; }>
```

### `streamSearchTermsOp`

```ts
/**
 * Combined term search with tri-channel streaming output.
 *
 * Launches three search strategies concurrently; results are pushed via
 * {
 *
 * @param data - Term search input parameters
 * @param ctx - Operation context
 *
 * @returns Async iterable that yields deduplicated term match results
 */
export const streamSearchTermsOp = (data: StreamSearchTermsInput, ctx?: OperationContext): AsyncIterable<{ term: string; translation: string; definition: string | null; conceptId: number; glossaryId: string; confidence: number; evidences: { channel: "exact" | "template" | "trgm" | "lexical" | "morphological" | "sparse" | "fragment" | "bm25" | "semantic"; confidence: number; matchedText?: string | undefined; matchedVariantText?: string | undefined; matchedVariantType?: string | undefined; note?: string | undefined; }[]; matchedText?: string | undefined; }>
```

### `termRecallOp`

```ts
/**
 * Term recall.
 *
 * Given a source text and glossary IDs, finds matching terms via ILIKE +
 * word_similarity, then enriches each match with its concept subject
 * information.
 *
 * @param data - Term recall input parameters
 * @param _ctx - Operation context (unused)
 *
 * @returns Term matches enriched with concept subject information
 */
export const termRecallOp = async (data: TermRecallInput, _ctx?: OperationContext): Promise<{ terms: { term: string; translation: string; definition: string | null; conceptId: number; glossaryId: string; confidence: number; evidences: { channel: "exact" | "template" | "trgm" | "lexical" | "morphological" | "sparse" | "fragment" | "bm25" | "semantic"; confidence: number; matchedText?: string | undefined; matchedVariantText?: string | undefined; matchedVariantType?: string | undefined; note?: string | undefined; }[]; concept: { subjects: { name: string; defaultDefinition: string | null; }[]; definition: string | null; }; matchedText?: string | undefined; }[]; }>
```

### `tokenizeOp`

```ts
/**
 * Tokenize text.
 *
 * Runs all registered TOKENIZER plugins in priority order.
 *
 * @param payload - Tokenization input parameters
 * @param ctx - Operation context
 *
 * @returns Token list (supports tree structure)
 */
export const tokenizeOp = async (payload: TokenizeInput, ctx?: OperationContext): Promise<{ tokens: import("@cat/plugin-core").Token[]; }>
```

### `triggerConceptRevectorize`

```ts
/**
 * Resolve the current TEXT_VECTORIZER / VECTOR_STORAGE plugins and
 * trigger concept re-vectorization in a fire-and-forget manner when both
 * are available.
 *
 * Silently skips when either plugin is unavailable (graceful degradation).
 *
 * @param conceptId - ID of the termConcept to re-vectorize
 * @param ctx - Operation context
 */
export const triggerConceptRevectorize = (conceptId: number, ctx?: OperationContext)
```

### `triggerTermRecallReindex`

```ts
/**
 * Fire-and-forget wrapper around `buildTermRecallVariantsOp`.
 *
 * Called from the `concept:updated` domain event handler to keep
 * `TermRecallVariant` rows fresh after any term content change.
 *
 * Errors are logged but do not propagate (graceful degradation).
 */
export const triggerTermRecallReindex = (conceptId: number, ctx?: OperationContext)
```

### `updateConceptOp`

```ts
/**
 * Update the definition and/or M:N subject associations of a termConcept.
 *
 * After the write completes, the domain event handler automatically
 * triggers concept re-vectorization.
 *
 * @param data - Concept update input parameters
 * @param ctx - Operation context
 *
 * @returns Whether any update was applied
 */
export const updateConceptOp = async (data: UpdateConceptInput, ctx?: OperationContext): Promise<{ updated: boolean; }>
```

### `upsertDocumentFromFileOp`

```ts
/**
 * Update document elements from a file.
 *
 * 1. Parse the file to obtain an element list
 * 2. Fetch the current (old) element IDs for the document
 * 3. Diff the new and old elements and apply additions, deletions, and updates
 *
 * @param data - File-from-document update input parameters
 * @param ctx - Operation context
 *
 * @returns Result containing the count of added and removed elements
 */
export const upsertDocumentFromFileOp = async (data: UpsertDocumentInput, ctx?: OperationContext): Promise<{ success: boolean; addedCount: number; removedCount: number; }>
```

### `vectorTermAlignOp`

```ts
/**
 * Term alignment via vector cosine similarity.
 *
 * 1. Vectorize each candidate term (text + definition) and create a
 * formal TranslatableString
 * 2. Perform pairwise cosine-similarity comparison across language groups
 * 3. Record pairs with similarity >= minSimilarity into alignedPairs
 *
 * @param data - Vector alignment input parameters
 * @param ctx - Operation context
 *
 * @returns Aligned term pairs and the stringId list for each candidate
 */
export const vectorTermAlignOp = async (data: VectorTermAlignInput, ctx?: OperationContext): Promise<{ alignedPairs: { groupAIndex: number; candidateAIndex: number; groupBIndex: number; candidateBIndex: number; similarity: number; }[]; stringIds: { groupIndex: number; candidateIndex: number; stringId: number; }[]; }>
```

### `processVectorizationBatch`

```ts
/**
 * Process a batch of vectorization queue tasks: vectorize → backfill chunkSetId → update status → publish event.
 */
export const processVectorizationBatch = async (queue: TaskQueue<VectorizationTask>, batchSize: number, ctx?: OperationContext): Promise<void>
```

### `vectorizeToChunkSetOp`

```ts
/**
 * Vectorize texts and store as ChunkSets.
 *
 * Uses the TEXT_VECTORIZER plugin to convert texts into embedding vectors,
 * creates ChunkSet/Chunk rows, and persists the vectors via the
 * VECTOR_STORAGE plugin.
 *
 * @param ctx - Operation context
 *
 * @returns List of ChunkSet IDs, one per input text
 */
export const vectorizeToChunkSetOp = async ({ data, vectorStorageId, vectorizerId }: VectorizeInput, ctx?: OperationContext): Promise<{ chunkSetIds: number[]; }>
```

### packages/operations/src/precision

### `evaluateAmbiguity`

```ts
/**
 * Evaluate four ambiguity rules:
 * 1. Top-tier confidence gap too small (< THRESHOLD between rank-0 and rank-1 in same tier).
 * 2. Top candidates' evidence families diverge (no shared channel at all).
 * 3. Query topic hypothesis is weak / conflicting / unknown AND anchors don't resolve.
 * 4. Top candidate has a recoverable-conflict decision note.
 *
 * Returns an AmbiguityEnvelope describing whether and where to invoke the model.
 * Clear Tier-1 winners (tier="1" and no recoverable-conflict) are EXCLUDED from the band.
 */
export function evaluateAmbiguity(ranked: RecallCandidate[], hypothesis: { topicIds: string[]; confidence: "unknown" | "confident" | "weak" | "conflicting"; note?: string | undefined; }): { shouldInvokeModel: boolean; eligibleBand: { start: number; end: number; reasons: string[]; anchorCandidateId?: string | undefined; }; }
```

### `applyBudgetGate`

```ts
/**
 * Reserved criteria (any ONE is sufficient):
 *  - memory exact match (channel "exact" present in evidences)
 *  - term complete surface equality (channel "lexical" with confidence >= 0.95)
 *  - template match (channel "template" present)
 *  - multi-evidence candidate with anchor-compatible match (hasNumericAnchor or hasPlaceholderAnchor)
 *
 * All remaining candidates enter the competitive pool up to maxTotal.
 * The budget gate annotates each candidate's `budgetClass` in-place and
 * returns the trimmed array in reserved-first order.
 */
export function applyBudgetGate(candidates: RecallCandidate[], profile: { tokenCount: number; contentWordDensity: number; hasNumericAnchor: boolean; hasPlaceholderAnchor: boolean; isTemplateLike: boolean; isShortQuery: boolean; hasEntityWord: boolean; }, opts: BudgetGateOptions): RecallCandidate[]
```

### `applyDeterministicRanking`

```ts
/**
 * Assign tiers to all candidates, sort by tier then in-tier score,
 * and record tier assignments in rankingDecisions.
 */
export function applyDeterministicRanking(candidates: RecallCandidate[], profile: { tokenCount: number; contentWordDensity: number; hasNumericAnchor: boolean; hasPlaceholderAnchor: boolean; isTemplateLike: boolean; isShortQuery: boolean; hasEntityWord: boolean; }, hypothesis: { topicIds: string[]; confidence: "unknown" | "confident" | "weak" | "conflicting"; note?: string | undefined; }): RecallCandidate[]
```

### `buildFusionLedger`

```ts
/**
 * Build a Fusion Ledger from a flat list of raw results from all lanes.
 *
 * For each unique candidate (by candidateKey):
 *  - Keeps the body fields from the highest-confidence lane result.
 *  - Unions evidences from all lanes (deduped by evidenceKey).
 *  - Sets confidence = max across all lanes.
 *  - Records a "ledger-merged" RankingDecision.
 *
 * Returns RecallCandidate[] sorted by descending confidence.
 */
export function buildFusionLedger(raw: RawResult[]): RecallCandidate[]
```

### `applyModelReranker`

```ts
export async function applyModelReranker(input: ApplyModelRerankerInput): Promise<RecallCandidate[]>
```

### `suppressTier3IfClearTier1Winner`

```ts
/**
 * After model reranking, suppress Tier-3 candidates when the top result is a
 * clear Tier-1 winner (no recoverable-conflict note). This prevents low-certainty
 * single-path noise from appearing alongside a definitive high-confidence match.
 * @internal — exposed for unit testing only; use runPrecisionPipeline for production code.
 */
export function suppressTier3IfClearTier1Winner(ranked: RecallCandidate[]): RecallCandidate[]
```

### `runPrecisionPipeline`

```ts
/**
 * Run the full precision pipeline on a flat list of raw multi-lane results.
 *
 * This function is surface-agnostic: it works with both RawTermResult[] and
 * RawMemoryResult[] (and mixed arrays, if ever needed).
 */
export async function runPrecisionPipeline(raw: RawResult[], opts: PrecisionPipelineOptions): Promise<RecallCandidate[]>
```

### `profileQuery`

```ts
/**
 * Extract a QueryProfile from the raw query text.
 *
 * Rules:
 * - tokenCount   = word-boundary split on Unicode letters/digits (\p{L}|\p{N})+
 * - contentWordDensity = tokens that are not pure-stop-words and not pure punct
 * - isShortQuery  = tokenCount <= 3 AND contentWordDensity >= 0.5
 * - hasNumericAnchor = any token matches /^\d[\d.,]*$/
 * - hasPlaceholderAnchor = any token matches %s / %d / {N} / {WORD} patterns
 * - isTemplateLike = hasPlaceholderAnchor OR (isShortQuery AND hasNumericAnchor)
 * - hasEntityWord  = any token with 2+ consecutive uppercase letters OR CamelCase ≥6 chars
 */
export function profileQuery(text: string): { tokenCount: number; contentWordDensity: number; hasNumericAnchor: boolean; hasPlaceholderAnchor: boolean; isTemplateLike: boolean; isShortQuery: boolean; hasEntityWord: boolean; }
```

### `resolveQueryTopic`

```ts
/**
 * Infer a QueryTopicHypothesis from the query profile + the Tier-1 candidates
 * already present in the ledger after the Budget Gate.
 *
 * Strategy:
 *  1. Collect topicIds from all candidates that have budgetClass="reserved"
 *     AND topicAssignment.matchState != "conflict".
 *  2. Find the majority topicId (highest frequency).
 *  3. Set confidence:
 *     - "confident"   if ≥2 reserved candidates agree on the majority topic
 *     - "weak"        if only 1 candidate provides the majority topic
 *     - "conflicting" if top-2 topics have the same frequency > 0
 *     - "unknown"     if no reserved candidate has a topic assignment
 *
 * NOTE: element context is NOT an input here (per spec §Component Design / Query Topic Resolver).
 */
export function resolveQueryTopic(candidates: RecallCandidate[], _profile: { tokenCount: number; contentWordDensity: number; hasNumericAnchor: boolean; hasPlaceholderAnchor: boolean; isTemplateLike: boolean; isShortQuery: boolean; hasEntityWord: boolean; }): { topicIds: string[]; confidence: "unknown" | "confident" | "weak" | "conflicting"; note?: string | undefined; }
```

### `buildAnchorSignature`

```ts
/**
 * Build an AnchorSignature comparing query vs candidate source text.
 */
export function buildAnchorSignature(queryText: string, candidateSource: string): { queryNumbers: string[]; queryPlaceholders: string[]; candidateNumbers: string[]; candidatePlaceholders: string[]; numbersCompatible: boolean; placeholdersCompatible: boolean; }
```

### `applyGuards`

```ts
/**
 * Apply all three guards to a single candidate.
 *
 * Hard-filter (non-recoverable) conditions per spec §Component Design / Scope & Anchor Guard:
 *  - Scope: candidate scopeId not in allowedScopeIds (when allowedScopeIds.length > 0)
 *  - Topic: topicAssignment.matchState === "conflict" AND query hypothesis is "confident"
 *  - Anchor: numeric conflict (query has numbers, candidate has different numbers)
 *
 * Recoverable-conflict conditions:
 *  - Topic: topicAssignment.matchState === "unknown" AND query hypothesis is "confident"
 *  - Anchor: placeholder count mismatch (query has placeholders not in candidate)
 */
export function applyGuards(candidate: RecallCandidate, queryText: string, hypothesis: { topicIds: string[]; confidence: "unknown" | "confident" | "weak" | "conflicting"; note?: string | undefined; }, opts: ScopeGuardOptions): { result: GuardResult; note: string; }
```

### `applyGuardsToCandidates`

```ts
/**
 * Apply guards to all candidates in the ledger.
 * Hard-filtered candidates are marked with hardFiltered=true and removed from return value.
 * Recoverable-conflict candidates get a demotion decision note.
 */
export function applyGuardsToCandidates(candidates: RecallCandidate[], queryText: string, hypothesis: { topicIds: string[]; confidence: "unknown" | "confident" | "weak" | "conflicting"; note?: string | undefined; }, opts: ScopeGuardOptions): RecallCandidate[]
```

### `computeSparseEvidence`

```ts
/**
 * Compute a sparse lexical evidence entry for a candidate.
 *
 * Score = (number of matched content words) / (total query content words)
 * A score above minScore generates an evidence entry with channel="sparse".
 * @param — non-stop, non-punct lowercased tokens from query
 * @param — source text of the candidate
 * @param — minimum score to emit evidence (default 0.3)
 *
 * @param queryContentWords - — non-stop, non-punct lowercased tokens from query
 * @param candidateSource - — source text of the candidate
 * @param minScore - — minimum score to emit evidence (default 0.3)
 */
export function computeSparseEvidence(queryContentWords: string[], candidateSource: string, minScore?: number): { channel: "exact" | "template" | "trgm" | "lexical" | "morphological" | "sparse" | "fragment" | "bm25" | "semantic"; confidence: number; matchedText?: string | undefined; matchedVariantText?: string | undefined; matchedVariantType?: string | undefined; note?: string | undefined; } | null
```

### `augmentWithSparseLane`

```ts
/**
 * Augment raw results with sparse evidence where applicable.
 * Mutates the evidences array of each result in-place.
 */
export function augmentWithSparseLane(results: RawResult[], queryContentWords: string[], minScore?: number)
```

### `createTaxonomyRegistry`

```ts
/**
 * Create a TaxonomyRegistry from static options.
 *
 * Compatible-topic resolution (first phase): two topics are compatible if
 * they are identical OR if the compatibility table explicitly lists them as
 * compatible. Anything else is "unknown" if the candidate has no topic
 * assignment, or "conflict" if it has a topic assignment that is NOT in the
 * compatible set.
 */
export function createTaxonomyRegistry(opts: TaxonomyRegistryOptions, compatibility?: CompatibilityTable): TaxonomyRegistry
```

### `assignTopics`

```ts
/**
 * Apply taxonomy assignments to an array of RecallCandidates in-place.
 * Mutates `candidate.topicAssignment`.
 */
export function assignTopics(candidates: RecallCandidate[], registry: TaxonomyRegistry, queryTopicIds: string[], termSubjectMap: Map<number, string[]>)
```

### `candidateKey`

```ts
/**
 * Stable identity key for a candidate (uniquely distinguishes term/memory).
 */
export const candidateKey = (c: RawResult): string
```

### packages/operations/src/rerank

### `applyBandOrder`

```ts
export const applyBandOrder = (ranked: T[], band: { start: number; end: number }, orderedBand: T[]): T[]
```

### `selectContextBand`

```ts
/**
 * Select a bounded ambiguous top cluster for context-route reranking.
 *
 * Anchors on the highest-ranked candidate. Extends the band only while
 * candidates remain locally plausible by deterministic proximity AND have
 * positive context evidence. Returns null when the cluster is not genuinely
 * ambiguous or the top candidate is clearly ahead.
 */
export const selectContextBand = ({
  ranked,
  getCandidateId,
  getConfidence,
  getPositiveSignals,
}: SelectContextBandInput<T>): { start: number; end: number; reasons: string[]; anchorCandidateId?: string | undefined; } | null
```

### `normalizePrecisionTermCandidate`

```ts
/**
 * Normalize a term candidate into a RerankCandidateDocument for provider submission.
 */
export const normalizePrecisionTermCandidate = (c: RecallCandidate & RawTermResult, index: number): { candidateId: string; surface: "term" | "memory"; originalIndex: number; originalConfidence: number; title: string; sourceText: string; targetText?: string | undefined; definitionText?: string | undefined; contextText?: string | undefined; }
```

### `normalizePrecisionMemoryCandidate`

```ts
/**
 * Normalize a memory candidate into a RerankCandidateDocument for provider submission.
 */
export const normalizePrecisionMemoryCandidate = (c: RecallCandidate & RawMemoryResult, index: number): { candidateId: string; surface: "term" | "memory"; originalIndex: number; originalConfidence: number; title: string; sourceText: string; targetText?: string | undefined; definitionText?: string | undefined; contextText?: string | undefined; }
```

### `normalizePrecisionCandidates`

```ts
/**
 * Normalize a slice of RecallCandidates into RerankCandidateDocuments.
 * The index is relative to the slice (for stable candidateId ordering).
 */
export const normalizePrecisionCandidates = (_queryText: string, band: RecallCandidate[]): { candidateId: string; surface: "term" | "memory"; originalIndex: number; originalConfidence: number; title: string; sourceText: string; targetText?: string | undefined; definitionText?: string | undefined; contextText?: string | undefined; }[]
```

### `orchestrateRerank`

```ts
export const orchestrateRerank = async ({
  request,
  pluginManager,
  signal,
}: OrchestrateRerankInput): Promise<OrchestrateRerankResult>
```

## Type Index

* `AddTermToConceptInput` (type)

* `AddTermToConceptOutput` (type)

* `AutoTranslateInput` (type)

* `AutoTranslateOutput` (type)

* `BuildMemoryRecallVariantsInput` (type)

* `BuildTermRecallVariantsInput` (type)

* `CollectMemoryRecallInput` (type)

* `CollectTermRecallInput` (type)

* `CreateElementInput` (type)

* `CreateElementOutput` (type)

* `CreateTermInput` (type)

* `CreateTermOutput` (type)

* `CreateTranslationInput` (type)

* `CreateTranslationOutput` (type)

* `CreateTranslationPubPayload` (type)

* `CreateVectorizedStringInput` (type)

* `CreateVectorizedStringOutput` (type)

* `DeduplicateAndMatchInput` (type)

* `DeduplicateAndMatchOutput` (type)

* `DeleteTermInput` (type)

* `DeleteTermOutput` (type)

* `DiffElementsInput` (type)

* `DiffElementsOutput` (type)

* `FetchAdviseInput` (type)

* `FetchAdviseOutput` (type)

* `FetchBestTranslationCandidateInput` (type)

* `FetchBestTranslationCandidateOutput` (type)

* `FindOrCreateAutoTranslatePRInput` (interface)

* `FindOrCreateAutoTranslatePRResult` (interface)

* `LlmRefineTranslationInput` (type)

* `LlmRefineTranslationOutput` (type)

* `LlmTermAlignInput` (type)

* `LlmTermAlignOutput` (type)

* `LlmTermEnhanceInput` (type)

* `LlmTermEnhanceOutput` (type)

* `LlmTranslateConfig` (type)

* `LlmTranslateInput` (type)

* `LlmTranslateOutput` (type)

* `LoadElementTextsInput` (type)

* `LoadElementTextsOutput` (type)

* `LookupTermsInput` (type)

* `LookupTermsOutput` (type)

* `PlaceholderSlot` (interface)

* `PlaceholderResult` (interface)

* `SlotMappingEntry` (interface) — JSON-serializable slot mapping for database storage.

* `MergeAlignmentInput` (type)

* `MergeAlignmentOutput` (type)

* `MergePRFullInput` (interface) — Input parameters for mergePRFull.

* `MergePRFullResult` (interface) — Result of mergePRFull.

* `NlpBatchSegmentInput` (type)

* `NlpBatchSegmentOutput` (type)

* `TokenWindow` (type)

* `NlpSegmentInput` (type)

* `NlpSegmentOutput` (type)

* `ParseFileInput` (type)

* `ParseFileOutput` (type)

* `BudgetGateOptions` (type)

* `PrecisionPipelineOptions` (type)

* `ScopeGuardOptions` (type)

* `GuardResult` (type)

* `TaxonomyRegistryOptions` (type)

* `CompatibilityTable` (type) — Canonical topic compatibility table: topicId → Set of compatible topicIds

* `TaxonomyRegistry` (type)

* `RawTermResult` (type)

* `RawMemoryResult` (type)

* `RawResult` (type)

* `RecallCandidate` (type)

* `PrecisionContext` (type)

* `LookedUpTermWithPrecision` (type) — LookedUpTerm extended with optional pipeline decision trace (for regression testing).

* `MemorySuggestionWithPrecision` (type) — MemorySuggestion extended with optional pipeline decision trace (for regression testing).

* `QaTranslationInput` (type)

* `QaTranslationOutput` (type)

* `QAInput` (type)

* `QAOutput` (type)

* `RebasePRFullInput` (interface) — Input parameters for rebasePRFull.

* `RebasePRFullResult` (interface) — Result of rebasePRFull.

* `RecallContextRerankInput` (type)

* `TermRecallContextRerankInput` (type)

* `RetrieveEmbeddingsInput` (type)

* `RetrieveEmbeddingsOutput` (type)

* `RevectorizeConceptInput` (type)

* `RevectorizeConceptOutput` (type)

* `RevectorizeInput` (type)

* `RevectorizeOutput` (type)

* `RunAutoTranslatePipelineInput` (interface)

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

* `RecallFixture` (type)

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
