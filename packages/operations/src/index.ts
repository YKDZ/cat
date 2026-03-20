// === Types ===
export type { OperationContext } from "./types";

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

// === Leaf Operations ===
export {
  adaptMemoryOp,
  AdaptMemoryInputSchema,
  AdaptMemoryOutputSchema,
  type AdaptMemoryInput,
  type AdaptMemoryOutput,
} from "./adapt-memory";

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
  spotTermOp,
  SpotTermInputSchema,
  SpotTermOutputSchema,
  type SpotTermInput,
  type SpotTermOutput,
} from "./spot-term";

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
  createTranslatableStringOp,
  CreateTranslatableStringInputSchema,
  CreateTranslatableStringOutputSchema,
  type CreateTranslatableStringInput,
  type CreateTranslatableStringOutput,
} from "./create-translatable-string";

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
  qaTranslationOp,
  QaTranslationInputSchema,
  QaTranslationOutputSchema,
  type QaTranslationInput,
  type QaTranslationOutput,
} from "./qa-translation";

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
