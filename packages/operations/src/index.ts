// === Types ===
export type { OperationContext } from "./types.ts";
export type {
  MemorySuggestionWithPrecision,
  TermMatchWithPrecision,
} from "./precision/types.ts";

// === Memory utilities ===
export { insertMemory } from "./memory.ts";
export {
  processRecallDerivationBatch,
  RecallDerivationFreshnessError,
  assessRecallDerivationFreshness,
  startRecallDerivationWorker,
  waitForRecallDerivationFresh,
  type ProcessRecallDerivationBatchOptions,
  type RecallDerivationFreshnessAssessment,
  type RecallDerivationWorker,
  type RecallDerivationStateCommitObserver,
} from "./recall-derivation-runtime.ts";
export {
  createRecallDerivationTaskProjectionObserver,
  projectPendingRecallDerivationTasks,
} from "./recall-derivation-task-projection.ts";
export {
  writePersonalTranslationMemoryOp,
  WritePersonalTranslationMemoryInputSchema,
  WritePersonalTranslationMemoryOutputSchema,
  type WritePersonalTranslationMemoryInput,
  type WritePersonalTranslationMemoryOutput,
} from "./write-personal-translation-memory.ts";
export {
  promoteApprovedTranslationMemoryOp,
  PromoteApprovedTranslationMemoryInputSchema,
  PromoteApprovedTranslationMemoryOutputSchema,
  type PromoteApprovedTranslationMemoryInput,
  type PromoteApprovedTranslationMemoryOutput,
} from "./promote-approved-translation-memory.ts";
export {
  placeholderize,
  fillTemplate,
  slotsToMapping,
  mappingToSlots,
  type PlaceholderSlot,
  type SlotMappingEntry,
} from "./memory-template.ts";

export {
  fetchAdviseOp,
  FetchAdviseInputSchema,
  FetchAdviseOutputSchema,
  type FetchAdviseInput,
  type FetchAdviseOutput,
} from "./fetch-advise.ts";

export {
  tokenizeOp,
  TokenizeInputSchema,
  TokenizeOutputSchema,
  type TokenizeInput,
  type TokenizeOutput,
} from "./tokenize.ts";

export {
  vectorizeToChunkSetOp,
  VectorizeInputSchema,
  VectorizeOutputSchema,
  type VectorizeInput,
  type VectorizeOutput,
} from "./vectorize.ts";

export {
  retrieveEmbeddingsOp,
  RetrieveEmbeddingsInputSchema,
  RetrieveEmbeddingsOutputSchema,
  type RetrieveEmbeddingsInput,
  type RetrieveEmbeddingsOutput,
} from "./retrieve-embeddings.ts";

export {
  parseFileOp,
  ParseFileInputSchema,
  ParseFileOutputSchema,
  type ParseFileInput,
  type ParseFileOutput,
} from "./parse-file.ts";

export {
  revectorizeOp,
  RevectorizeInputSchema,
  RevectorizeOutputSchema,
  type RevectorizeInput,
  type RevectorizeOutput,
} from "./revectorize.ts";

export {
  revectorizeConceptOp,
  RevectorizeConceptInputSchema,
  RevectorizeConceptOutputSchema,
  type RevectorizeConceptInput,
  type RevectorizeConceptOutput,
} from "./revectorize-concept.ts";

export { triggerConceptRevectorize } from "./trigger-revectorize.ts";
export { registerDomainEventHandlers } from "./register-domain-event-handlers.ts";

export {
  qaOp,
  QAInputSchema,
  QAOutputSchema,
  type QAInput,
  type QAOutput,
} from "./qa.ts";

export {
  updateConceptOp,
  UpdateConceptInputSchema,
  UpdateConceptOutputSchema,
  type UpdateConceptInput,
  type UpdateConceptOutput,
} from "./update-concept.ts";

export {
  addTermToConceptOp,
  AddTermToConceptInputSchema,
  AddTermToConceptOutputSchema,
  type AddTermToConceptInput,
  type AddTermToConceptOutput,
} from "./add-term-to-concept.ts";

export {
  deleteTermOp,
  DeleteTermInputSchema,
  DeleteTermOutputSchema,
  type DeleteTermInput,
  type DeleteTermOutput,
} from "./delete-term.ts";

export {
  semanticSearchTermsOp,
  SemanticSearchTermsInputSchema,
  SemanticSearchTermsOutputSchema,
  type SemanticSearchTermsInput,
  type SemanticSearchTermsOutput,
} from "./semantic-search-terms.ts";

export {
  streamSearchTermsOp,
  StreamSearchTermsInputSchema,
  StreamSearchTermsEventSchema,
  type StreamSearchTermsEvent,
  type StreamSearchTermsInput,
} from "./stream-search-terms.ts";

export {
  LookupTermsInputSchema,
  LookupTermsOutputSchema,
  type LookupTermsInput,
  type LookupTermsOutput,
} from "./lookup-terms.ts";

export { lookupTermsForElementOp } from "./lookup-terms-for-element.ts";

export {
  searchChunkOp,
  SearchChunkInputSchema,
  SearchChunkOutputSchema,
  type SearchChunkInput,
  type SearchChunkOutput,
} from "./search-chunk.ts";

export {
  createVectorizedStringOp,
  CreateVectorizedStringInputSchema,
  CreateVectorizedStringOutputSchema,
  type CreateVectorizedStringInput,
  type CreateVectorizedStringOutput,
} from "./create-vectorized-string.ts";

export { processVectorizationBatch } from "./vectorization-consumer.ts";
export type { VectorizationTask } from "@cat/server-shared";
export { registerVectorizationConsumer } from "./register-vectorization-consumer.ts";

// === Level 2 Operations ===
export {
  createElementOp,
  CreateElementInputSchema,
  CreateElementOutputSchema,
  type CreateElementInput,
  type CreateElementOutput,
} from "./create-element.ts";

export {
  createTermOp,
  CreateTermInputSchema,
  CreateTermOutputSchema,
  type CreateTermInput,
  type CreateTermOutput,
} from "./create-term.ts";

export {
  searchMemoryOp,
  SearchMemoryInputSchema,
  SearchMemoryOutputSchema,
  type SearchMemoryInput,
  type SearchMemoryOutput,
} from "./search-memory.ts";

export {
  streamSearchMemoryOp,
  StreamSearchMemoryInputSchema,
  StreamSearchMemoryEventSchema,
  type StreamSearchMemoryEvent,
  type StreamSearchMemoryInput,
} from "./stream-search-memory.ts";

export {
  collectMemoryRecallOp,
  getMemoryRecallCandidates,
  CollectMemoryRecallInputBaseSchema,
  CollectMemoryRecallInputSchema,
  MemoryRecallCandidateSchema,
  MemoryRecallResultSchema,
  type CollectMemoryRecallInput,
  type MemoryRecallCandidate,
  type MemoryRecallResult,
} from "./collect-memory-recall.ts";
export {
  assertRecallOperationAvailable,
  getCandidateRecallCandidates,
  mapRecallOperationFailure,
  RecallOperationFailureError,
} from "./candidate-recall.ts";
export {
  collectEffectiveMemoryRecallOp,
  getEffectiveMemoryRecallCandidates,
  EffectiveMemoryRecallResultSchema,
  EffectiveMemoryRecallStreamEventSchema,
  CollectEffectiveMemoryRecallInputSchema,
  type CollectEffectiveMemoryRecallInput,
  type EffectiveMemoryRecallResult,
  type EffectiveMemoryRecallStreamEvent,
} from "./collect-effective-memory-recall.ts";

export {
  qaTranslationOp,
  QaTranslationInputSchema,
  QaTranslationOutputSchema,
  type QaTranslationInput,
  type QaTranslationOutput,
} from "./qa-translation.ts";

export { applyQaReviewPolicy } from "./qa-review/policy.ts";
export { normalizeQaResultItems } from "./qa-review/normalize.ts";

export {
  termRecallOp,
  TermRecallInputSchema,
  TermRecallOutputSchema,
  TermContextSchema,
  type TermRecallInput,
  type TermContext,
  type TermRecallOutput,
} from "./term-recall.ts";

export {
  recallContextRerankOp,
  rerankTermRecallOp,
} from "./recall-context-rerank.ts";

export {
  llmRefineTranslationOp,
  LlmRefineTranslationInputSchema,
  LlmRefineTranslationOutputSchema,
  type LlmRefineTranslationInput,
  type LlmRefineTranslationOutput,
} from "./llm-refine-translation.ts";

export {
  llmTranslateOp,
  LlmTranslateInputSchema,
  LlmTranslateOutputSchema,
  LlmTranslateConfigSchema,
  deriveLlmTranslateConfidence,
  type LlmTranslateInput,
  type LlmTranslateOutput,
  type LlmTranslateConfig,
} from "./llm-translate.ts";

// === Level 3+ Operations ===
export {
  createTranslationOp,
  CreateTranslationInputSchema,
  CreateTranslationOutputSchema,
  CreateTranslationPubPayloadSchema,
  type CreateTranslationInput,
  type CreateTranslationOutput,
  type CreateTranslationPubPayload,
} from "./create-translation.ts";

export {
  applyStructuredContentGraphEnvelope,
  persistStructuredContentGraphAttachments,
  ApplyStructuredContentGraphInputSchema,
  type ApplyStructuredContentGraphInput,
  type AppliedGraphEnvelope,
  type PersistGraphAttachmentsInput,
  type PersistGraphAttachmentsOutput,
} from "./apply-structured-content-graph.ts";

export {
  diffStructuredContentOp,
  DiffStructuredContentInputSchema,
  DiffStructuredContentOutputSchema,
  classifySemanticElementDiffForTest,
  type DiffStructuredContentInput,
  type DiffStructuredContentOutput,
  type ClassifySemanticElementDiffInput,
  type ClassifySemanticElementDiffResult,
} from "./diff-structured-content.ts";

export {
  upsertContentNodeFromFileOp,
  UpsertContentNodeFromFileInputSchema,
  UpsertContentNodeFromFileOutputSchema,
  type UpsertContentNodeFromFileInput,
  type UpsertContentNodeFromFileOutput,
} from "./upsert-content-node-from-file.ts";

export {
  autoTranslateOp,
  AutoTranslateInputSchema,
  AutoTranslateOutputSchema,
  type AutoTranslateInput,
  type AutoTranslateOutput,
} from "./auto-translate.ts";

// === Language Analysis Operations ===
export {
  languageAnalyzeOp,
  LanguageAnalysisInputSchema,
  LanguageAnalysisOutputSchema,
  type LanguageAnalysisInput,
  type LanguageAnalysisOutput,
} from "./language-analyze.ts";

export {
  assessLanguageAnalysisConfiguration,
  computeLanguageAnalysisConfigurationFingerprint,
  executeRequiredLanguageAnalysis,
  executeRequiredLanguageAnalysisBatch,
  executeLanguageAnalysisReadinessAssessment,
  LanguageAnalysisPolicyChangedError,
  LanguageAnalysisReadinessError,
  LanguageAnalysisRequirementError,
  validateLanguageAnalyzerConfiguration,
  type LanguageAnalysisOperationContext,
} from "./language-analysis-requirement.ts";

export {
  LanguageAnalysisOperationFailureError,
  mapLanguageAnalysisOperationFailure,
} from "./language-analysis-operation-failure.ts";

export {
  languageAnalyzeBatchOp,
  LanguageAnalysisBatchInputSchema,
  LanguageAnalysisBatchOutputSchema,
  type LanguageAnalysisBatchInput,
  type LanguageAnalysisBatchOutput,
} from "./language-analyze-batch.ts";

// === Term Discovery Operations ===
export {
  resolveOperationScopeElementsOp,
  ResolveOperationScopeElementsInputSchema,
  type ResolveOperationScopeElementsInput,
  type OperationScopeElement,
} from "./resolve-operation-scope-elements.ts";

export {
  loadElementTextsOp,
  LoadElementTextsInputSchema,
  LoadElementTextsOutputSchema,
  type LoadElementTextsInput,
  type LoadElementTextsOutput,
} from "./load-element-texts.ts";

export {
  statisticalTermExtractOp,
  StatisticalTermExtractInputSchema,
  StatisticalTermExtractOutputSchema,
  type StatisticalTermExtractInput,
  type StatisticalTermExtractOutput,
} from "./statistical-term-extract.ts";

export {
  deduplicateAndMatchOp,
  DeduplicateAndMatchInputSchema,
  DeduplicateAndMatchOutputSchema,
  type DeduplicateAndMatchInput,
  type DeduplicateAndMatchOutput,
} from "./deduplicate-match-terms.ts";

export {
  collectTermRecallOp,
  getTermRecallCandidates,
  CollectTermRecallInputSchema,
  TermRecallCandidateSchema,
  TermRecallResultSchema,
  type CollectTermRecallInput,
  type TermRecallCandidate,
  type TermRecallResult,
} from "./collect-term-recall.ts";

export {
  llmTermEnhanceOp,
  LlmTermEnhanceInputSchema,
  LlmTermEnhanceOutputSchema,
  type LlmTermEnhanceInput,
  type LlmTermEnhanceOutput,
} from "./llm-term-enhance.ts";

// === Term Alignment Operations ===
export {
  vectorTermAlignOp,
  VectorTermAlignInputSchema,
  VectorTermAlignOutputSchema,
  type VectorTermAlignInput,
  type VectorTermAlignOutput,
} from "./vector-term-align.ts";

export {
  statisticalTermAlignOp,
  StatisticalTermAlignInputSchema,
  StatisticalTermAlignOutputSchema,
  type StatisticalTermAlignInput,
  type StatisticalTermAlignOutput,
} from "./statistical-term-align.ts";

export {
  llmTermAlignOp,
  LlmTermAlignInputSchema,
  LlmTermAlignOutputSchema,
  type LlmTermAlignInput,
  type LlmTermAlignOutput,
} from "./llm-term-align.ts";

export {
  mergeAlignmentOp,
  MergeAlignmentInputSchema,
  MergeAlignmentOutputSchema,
  type MergeAlignmentInput,
  type MergeAlignmentOutput,
} from "./merge-alignment.ts";

// === VCS Operations ===
export {
  mergePRFull,
  type MergePRFullInput,
  type MergePRFullResult,
} from "./merge-pr-full.ts";

export {
  rebasePRFull,
  type RebasePRFullInput,
  type RebasePRFullResult,
} from "./rebase-pr-full.ts";

// === Auto-translate Pipeline ===
export {
  fetchBestTranslationCandidateOp,
  FetchBestTranslationCandidateInputSchema,
  FetchBestTranslationCandidateOutputSchema,
  type FetchBestTranslationCandidateInput,
  type FetchBestTranslationCandidateOutput,
} from "./fetch-best-translation-candidate.ts";

export {
  findOrCreateAutoTranslatePR,
  type FindOrCreateAutoTranslatePRInput,
  type FindOrCreateAutoTranslatePRResult,
} from "./find-or-create-auto-translate-pr.ts";

export {
  runAutoTranslatePipeline,
  type RunAutoTranslatePipelineInput,
} from "./run-auto-translate-pipeline.ts";

export {
  applyHnfPreRules,
  applyHnfPostRules,
  applyMemoryHnfPre,
  applyMemoryHnfPost,
  applyTermHnfPre,
} from "./hard-negative-filter/index.ts";
export type {
  HardNegativeRemoval,
  HardNegativeReason,
  HnfCandidate,
  HnfRuleResult,
} from "./hard-negative-filter/index.ts";

export { matchTemplateStructure } from "./template-structure-matcher.ts";
export { applySelfExclusion } from "./self-exclusion-filter.ts";
export { sortByQuality, createSuggestionCollector } from "./quality-sorter.ts";
export type { QualitySortConfig, QueuedSuggestion } from "./quality-sorter.ts";
