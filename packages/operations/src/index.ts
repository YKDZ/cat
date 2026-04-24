// === Types ===
export type { OperationContext } from "./types";
export type {
  MemorySuggestionWithPrecision,
  LookedUpTermWithPrecision,
} from "./precision/types";

// === Memory utilities ===
export { insertMemory } from "./memory";
export {
  placeholderize,
  fillTemplate,
  slotsToMapping,
  mappingToSlots,
  type PlaceholderSlot,
  type SlotMappingEntry,
} from "./memory-template";

export {
  fetchAdviseOp,
  FetchAdviseInputSchema,
  FetchAdviseOutputSchema,
  type FetchAdviseInput,
  type FetchAdviseOutput,
} from "./fetch-advise";

export {
  tokenizeOp,
  TokenizeInputSchema,
  TokenizeOutputSchema,
  type TokenizeInput,
  type TokenizeOutput,
} from "./tokenize";

export {
  vectorizeToChunkSetOp,
  VectorizeInputSchema,
  VectorizeOutputSchema,
  type VectorizeInput,
  type VectorizeOutput,
} from "./vectorize";

export {
  retrieveEmbeddingsOp,
  RetrieveEmbeddingsInputSchema,
  RetrieveEmbeddingsOutputSchema,
  type RetrieveEmbeddingsInput,
  type RetrieveEmbeddingsOutput,
} from "./retrieve-embeddings";

export {
  parseFileOp,
  ParseFileInputSchema,
  ParseFileOutputSchema,
  type ParseFileInput,
  type ParseFileOutput,
} from "./parse-file";

export {
  revectorizeOp,
  RevectorizeInputSchema,
  RevectorizeOutputSchema,
  type RevectorizeInput,
  type RevectorizeOutput,
} from "./revectorize";

export {
  revectorizeConceptOp,
  RevectorizeConceptInputSchema,
  RevectorizeConceptOutputSchema,
  type RevectorizeConceptInput,
  type RevectorizeConceptOutput,
} from "./revectorize-concept";

export { triggerConceptRevectorize } from "./trigger-revectorize";
export { registerDomainEventHandlers } from "./register-domain-event-handlers";

export {
  qaOp,
  QAInputSchema,
  QAOutputSchema,
  type QAInput,
  type QAOutput,
} from "./qa";

export {
  updateConceptOp,
  UpdateConceptInputSchema,
  UpdateConceptOutputSchema,
  type UpdateConceptInput,
  type UpdateConceptOutput,
} from "./update-concept";

export {
  addTermToConceptOp,
  AddTermToConceptInputSchema,
  AddTermToConceptOutputSchema,
  type AddTermToConceptInput,
  type AddTermToConceptOutput,
} from "./add-term-to-concept";

export {
  deleteTermOp,
  DeleteTermInputSchema,
  DeleteTermOutputSchema,
  type DeleteTermInput,
  type DeleteTermOutput,
} from "./delete-term";

export {
  semanticSearchTermsOp,
  SemanticSearchTermsInputSchema,
  SemanticSearchTermsOutputSchema,
  type SemanticSearchTermsInput,
  type SemanticSearchTermsOutput,
} from "./semantic-search-terms";

export {
  streamSearchTermsOp,
  StreamSearchTermsInputSchema,
  type StreamSearchTermsInput,
} from "./stream-search-terms";

export {
  LookupTermsInputSchema,
  LookupTermsOutputSchema,
  type LookupTermsInput,
  type LookupTermsOutput,
} from "./lookup-terms";

export { lookupTermsForElementOp } from "./lookup-terms-for-element";

export {
  searchChunkOp,
  SearchChunkInputSchema,
  SearchChunkOutputSchema,
  type SearchChunkInput,
  type SearchChunkOutput,
} from "./search-chunk";

export {
  createVectorizedStringOp,
  CreateVectorizedStringInputSchema,
  CreateVectorizedStringOutputSchema,
  type CreateVectorizedStringInput,
  type CreateVectorizedStringOutput,
} from "./create-vectorized-string";

export { processVectorizationBatch } from "./vectorization-consumer";
export type { VectorizationTask } from "@cat/server-shared";
export { registerVectorizationConsumer } from "./register-vectorization-consumer";

// === Level 2 Operations ===
export {
  createElementOp,
  CreateElementInputSchema,
  CreateElementOutputSchema,
  type CreateElementInput,
  type CreateElementOutput,
} from "./create-element";

export {
  createTermOp,
  CreateTermInputSchema,
  CreateTermOutputSchema,
  type CreateTermInput,
  type CreateTermOutput,
} from "./create-term";

export {
  searchMemoryOp,
  SearchMemoryInputSchema,
  SearchMemoryOutputSchema,
  type SearchMemoryInput,
  type SearchMemoryOutput,
} from "./search-memory";

export {
  streamSearchMemoryOp,
  StreamSearchMemoryInputSchema,
  type StreamSearchMemoryInput,
} from "./stream-search-memory";

export {
  collectMemoryRecallOp,
  CollectMemoryRecallInputSchema,
  type CollectMemoryRecallInput,
} from "./collect-memory-recall";
export {
  BM25_DISABLED_REASON,
  buildMemoryRecallBm25Capabilities,
  compressBm25Score,
  MEMORY_RECALL_BM25_REGISTRY,
} from "./memory-recall-bm25";

export {
  qaTranslationOp,
  QaTranslationInputSchema,
  QaTranslationOutputSchema,
  type QaTranslationInput,
  type QaTranslationOutput,
} from "./qa-translation";

export {
  termRecallOp,
  TermRecallInputSchema,
  TermRecallOutputSchema,
  TermContextSchema,
  type TermRecallInput,
  type TermContext,
  type TermRecallOutput,
} from "./term-recall";

export {
  recallContextRerankOp,
  rerankTermRecallOp,
} from "./recall-context-rerank";

export {
  llmRefineTranslationOp,
  LlmRefineTranslationInputSchema,
  LlmRefineTranslationOutputSchema,
  type LlmRefineTranslationInput,
  type LlmRefineTranslationOutput,
} from "./llm-refine-translation";

export {
  llmTranslateOp,
  LlmTranslateInputSchema,
  LlmTranslateOutputSchema,
  LlmTranslateConfigSchema,
  deriveLlmTranslateConfidence,
  type LlmTranslateInput,
  type LlmTranslateOutput,
  type LlmTranslateConfig,
} from "./llm-translate";

// === Level 3+ Operations ===
export {
  createTranslationOp,
  CreateTranslationInputSchema,
  CreateTranslationOutputSchema,
  CreateTranslationPubPayloadSchema,
  type CreateTranslationInput,
  type CreateTranslationOutput,
  type CreateTranslationPubPayload,
} from "./create-translation";

export {
  diffElementsOp,
  DiffElementsInputSchema,
  DiffElementsOutputSchema,
  type DiffElementsInput,
  type DiffElementsOutput,
} from "./diff-elements";

export {
  autoTranslateOp,
  AutoTranslateInputSchema,
  AutoTranslateOutputSchema,
  type AutoTranslateInput,
  type AutoTranslateOutput,
} from "./auto-translate";

export {
  upsertDocumentFromFileOp,
  UpsertDocumentInputSchema,
  UpsertDocumentOutputSchema,
  type UpsertDocumentInput,
  type UpsertDocumentOutput,
} from "./upsert-document-from-file";

// === NLP Operations ===
export {
  nlpSegmentOp,
  NlpSegmentInputSchema,
  NlpSegmentOutputSchema,
  type NlpSegmentInput,
  type NlpSegmentOutput,
} from "./nlp-segment";

export {
  nlpBatchSegmentOp,
  NlpBatchSegmentInputSchema,
  NlpBatchSegmentOutputSchema,
  type NlpBatchSegmentInput,
  type NlpBatchSegmentOutput,
} from "./nlp-batch-segment";

// === Term Discovery Operations ===
export {
  loadElementTextsOp,
  LoadElementTextsInputSchema,
  LoadElementTextsOutputSchema,
  type LoadElementTextsInput,
  type LoadElementTextsOutput,
} from "./load-element-texts";

export {
  statisticalTermExtractOp,
  StatisticalTermExtractInputSchema,
  StatisticalTermExtractOutputSchema,
  type StatisticalTermExtractInput,
  type StatisticalTermExtractOutput,
} from "./statistical-term-extract";

export {
  deduplicateAndMatchOp,
  DeduplicateAndMatchInputSchema,
  DeduplicateAndMatchOutputSchema,
  type DeduplicateAndMatchInput,
  type DeduplicateAndMatchOutput,
} from "./deduplicate-match-terms";

export {
  collectTermRecallOp,
  CollectTermRecallInputSchema,
  type CollectTermRecallInput,
} from "./collect-term-recall";

export { buildTermRecallVariantsOp } from "./build-term-recall-variants";
export { buildMemoryRecallVariantsOp } from "./build-memory-recall-variants";
export { triggerTermRecallReindex } from "./trigger-term-recall-reindex";

export {
  llmTermEnhanceOp,
  LlmTermEnhanceInputSchema,
  LlmTermEnhanceOutputSchema,
  type LlmTermEnhanceInput,
  type LlmTermEnhanceOutput,
} from "./llm-term-enhance";

// === Term Alignment Operations ===
export {
  vectorTermAlignOp,
  VectorTermAlignInputSchema,
  VectorTermAlignOutputSchema,
  type VectorTermAlignInput,
  type VectorTermAlignOutput,
} from "./vector-term-align";

export {
  statisticalTermAlignOp,
  StatisticalTermAlignInputSchema,
  StatisticalTermAlignOutputSchema,
  type StatisticalTermAlignInput,
  type StatisticalTermAlignOutput,
} from "./statistical-term-align";

export {
  llmTermAlignOp,
  LlmTermAlignInputSchema,
  LlmTermAlignOutputSchema,
  type LlmTermAlignInput,
  type LlmTermAlignOutput,
} from "./llm-term-align";

export {
  mergeAlignmentOp,
  MergeAlignmentInputSchema,
  MergeAlignmentOutputSchema,
  type MergeAlignmentInput,
  type MergeAlignmentOutput,
} from "./merge-alignment";

// === VCS Operations ===
export {
  mergePRFull,
  type MergePRFullInput,
  type MergePRFullResult,
} from "./merge-pr-full";

export {
  rebasePRFull,
  type RebasePRFullInput,
  type RebasePRFullResult,
} from "./rebase-pr-full";

// === Auto-translate Pipeline ===
export {
  fetchBestTranslationCandidateOp,
  FetchBestTranslationCandidateInputSchema,
  FetchBestTranslationCandidateOutputSchema,
  type FetchBestTranslationCandidateInput,
  type FetchBestTranslationCandidateOutput,
} from "./fetch-best-translation-candidate";

export {
  findOrCreateAutoTranslatePR,
  type FindOrCreateAutoTranslatePRInput,
  type FindOrCreateAutoTranslatePRResult,
} from "./find-or-create-auto-translate-pr";

export {
  runAutoTranslatePipeline,
  type RunAutoTranslatePipelineInput,
} from "./run-auto-translate-pipeline";
