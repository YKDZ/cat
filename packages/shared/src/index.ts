// ─── Hand-written schema modules ───

export {
  DatabaseRequirementIdSchema,
  DatabaseRequirementIdValues,
  type DatabaseRequirementId,
  DatabaseRequirementStatusSchema,
  DatabaseRequirementStatusValues,
  type DatabaseRequirementStatus,
} from "#/schema/enum.ts";

export {
  DefaultDisplayLanguage,
  type DisplayLanguage,
  DisplayLanguageSchema,
  DisplayLanguageValues,
} from "#/schema/display-language.ts";

export {
  databaseReadinessCode,
  DatabaseReadinessCodeSchema,
  DatabaseReadinessCodeValues,
  type DatabaseReadinessCode,
  DatabaseRequirementAssessmentSchema,
  DatabaseRequirementBlockedReasonSchema,
  DatabaseRequirementBlockerReasonSchema,
  DatabaseRequirementBlockerReasonValues,
  type DatabaseRequirementBlockerReason,
  type DatabaseRequirementBlockedReason,
  DatabaseRequirementSchema,
  DatabaseRequirementSetSchema,
  type DatabaseRequirement,
  type DatabaseRequirementAssessment,
  type DatabaseRequirementSet,
  DatabaseRequirementUnknownReasonSchema,
  type DatabaseRequirementUnknownReason,
} from "#/schema/database-requirements.ts";

export {
  RequiredVectorDimension,
  RequiredVectorDimensionSchema,
} from "#/schema/vector-runtime.ts";

// Custom element schema
export { CustomElementNameSchema } from "#/schema/ce.ts";
export {
  type OperationFailure,
  type OperationFailureInput,
  type OperationFailureClientProjection,
  type OperationFailurePublicProjection,
  type OperationFailureRedactedProjection,
  OperationFailureClientProjectionSchema,
  OperationFailureInputSchema,
  OperationFailurePublicProjectionSchema,
  OperationFailureRedactedProjectionSchema,
  OperationFailureSchema,
  toOperationFailureClientProjection,
  type TaskActor,
  TaskActorSchema,
  type TaskAffectedResource,
  TaskAffectedResourceSchema,
  type TaskKind,
  TaskKindSchema,
  type TaskPayload,
  TaskPayloadSchema,
  BatchAutoTranslationTaskPayloadSchema,
  RecallDerivationTaskPayloadSchema,
  BatchAutoTranslationInvocationSchema,
  MAX_BATCH_AUTO_TRANSLATION_SNAPSHOT_ELEMENTS,
  type BatchAutoTranslationInvocation,
  AutoTranslateConfigSchema,
  type AutoTranslateConfig,
  type BatchAutoTranslationTaskResult,
  BatchAutoTranslationTaskResultSchema,
  type RecallDerivationTaskResult,
  RecallDerivationTaskResultSchema,
  type TaskScope,
  TaskScopeSchema,
  type TaskState,
  TaskStateSchema,
  type TaskRuntime,
  TaskRuntimeSchema,
} from "#/schema/localization-task.ts";

// Extraction schema
export {
  type CaptureRouteResult,
  type CaptureResult,
  CaptureResultMetadataSchema,
  type CaptureResultMetadata,
  CaptureResultSchema,
  CaptureRouteResultSchema,
  type CaptureScreenshotEntry,
  CaptureScreenshotEntrySchema,
  type ExtractionMetadata,
  ExtractionMetadataSchema,
  type ExtractionResult,
  ExtractionResultSchema,
  type NavigationStep,
  NavigationStepSchema,
  type RouteEntry,
  RouteEntrySchema,
  type RouteManifest,
  RouteManifestSchema,
} from "#/schema/extraction.ts";

// JSON schema
export {
  type JSONArray,
  type JSONObject,
  JSONObjectSchema,
  type JSONSchema,
  JSONSchemaSchema,
  type JSONType,
  type NonNullJSONType,
  type SerializableType,
  type _JSONSchema,
  _JSONSchemaSchema,
  nonNullSafeZDotJson,
  safeZDotJson,
} from "#/schema/json.ts";

// Misc schema
export {
  type AdaptationMethod,
  AdaptationMethodSchema,
  type AuthMethod,
  AuthMethodSchema,
  DrizzleDateTimeSchema,
  type ElementTranslationStatus,
  ElementTranslationStatusSchema,
  type FileMeta,
  FileMetaSchema,
  type MemorySuggestion,
  MemorySuggestionSchema,
  type TermData,
  TermDataSchema,
  type TranslatableElementData,
  TranslatableElementDataSchema,
  type TranslationAdvisorData,
  TranslationAdvisorDataSchema,
  type TranslationSuggestionStatus,
  TranslationSuggestionStatusSchema,
  type UnvectorizedTextData,
  UnvectorizedTextDataSchema,
  type VectorizedTextData,
  VectorizedTextDataSchema,
} from "#/schema/misc.ts";

// Plugin schema
export {
  type PluginData,
  PluginDataSchema,
  type PluginManifest,
  PluginManifestSchema,
  type TranslationAdvise,
  TranslationAdviseSchema,
  type TranslationSuggestion,
  TranslationSuggestionSchema,
} from "#/schema/plugin.ts";

export {
  type ServiceImplementationReference,
  ServiceImplementationReferenceSchema,
  serviceImplementationReferenceKey,
} from "#/schema/service-implementation-reference.ts";

// Language Analysis schema
export {
  computeLanguageAnalysisVersion,
  type LanguageAnalyzerConfigurationAssessment,
  LanguageAnalyzerConfigurationAssessmentSchema,
  type LanguageAnalysisAttestation,
  LanguageAnalysisAttestationSchema,
  type LanguageAnalysisBatchResult,
  LanguageAnalysisBatchResultSchema,
  type LanguageAnalysisResult,
  LanguageAnalysisResultSchema,
  type LanguageAnalysisSentence,
  LanguageAnalysisSentenceSchema,
  type LanguageAnalysisToken,
  LanguageAnalysisTokenSchema,
  type LanguageAnalysisVersion,
  LanguageAnalysisVersionSchema,
  LanguageAnalysisValidationError,
  type LanguageAnalysisValidationCode,
  LanguageAnalysisValidationCodeValues,
  type NormalizedLanguageId,
  NormalizedLanguageIdSchema,
  normalizeLanguageId,
  stableSerializeLanguageAnalysis,
  validateLanguageAnalysisBatchResult,
  validateLanguageAnalysisResult,
} from "#/schema/language-analysis.ts";

export {
  type CanonicalInputVersion,
  CanonicalInputVersionSchema,
  classifyRecallDerivationBlocker,
  compareRecallDerivationTokenizerPipelineEntries,
  computeCanonicalInputVersion,
  computeRecallDerivationVersion,
  type RecallDerivationBlocker,
  type RecallDerivationBlockerLifecycle,
  RecallDerivationBlockerSchema,
  type RecallDerivationReference,
  MemoryItemRecallDerivationReferenceSchema,
  RecallDerivationReferenceSchema,
  RecallDerivationTargetIdSchema,
  type RecallDerivationTokenizerPipelineEntry,
  type RecallDerivationVersion,
  RecallDerivationVersionInputSchema,
  RecallDerivationVersionSchema,
  TermConceptRecallDerivationReferenceSchema,
} from "#/schema/recall-derivation.ts";

export {
  computeMemoryCanonicalInputVersion,
  computeMemoryDeletionCanonicalInputVersion,
  type MemoryCanonicalSnapshot,
  MemoryCanonicalSnapshotSchema,
  type MemoryRecallVariantDraft,
  MemoryRecallVariantDraftSchema,
  type MemoryRecallVariantMeta,
  MemoryRecallVariantMetaSchema,
} from "#/schema/memory-recall-derivation.ts";

export {
  computeTermConceptCanonicalInputVersion,
  computeTermConceptDeletionCanonicalInputVersion,
  type TermConceptCanonicalSnapshot,
  TermConceptCanonicalSnapshotSchema,
  type GlossaryConceptMaterialization,
  GlossaryConceptMaterializationSchema,
  GlossaryTermMaterializationSchema,
  type TermRecallVariantDraft,
  TermRecallVariantDraftSchema,
  type TermRecallVariantMeta,
  TermRecallVariantMetaSchema,
} from "#/schema/glossary-recall-derivation.ts";

export {
  type LanguageAnalysisBlocker,
  LanguageAnalysisBlockerPolicy,
  LanguageAnalysisOperationFailureBlocker,
  LanguageAnalysisBlockerReasonSchema,
  LanguageAnalysisBlockerReasonValues,
  type LanguageAnalysisPolicySnapshot,
  LanguageAnalysisPolicySnapshotSchema,
  type LanguageAnalysisBlockerReason,
  LanguageAnalysisBlockerSchema,
  type LanguageAnalysisObservation,
  LanguageAnalysisObservationSchema,
  type LanguageAnalysisObservationView,
  LanguageAnalysisObservationViewSchema,
  type LanguageAnalysisRemediation,
  LanguageAnalysisRemediationSchema,
  type LanguageAnalysisRequirementAssessment,
  LanguageAnalysisRequirementAssessmentSchema,
  type LanguageAnalysisRequirementStatus,
  LanguageAnalysisRequirementStatusSchema,
  LanguageAnalysisRequirementStatusValues,
  type LanguageAnalysisSelection,
  type LanguageAnalysisSelectionFingerprint,
  LanguageAnalysisSelectionFingerprintSchema,
  type LanguageAnalysisSelectionKey,
  LanguageAnalysisSelectionKeySchema,
  type LanguageAnalysisSelectionSource,
  LanguageAnalysisSelectionSourceSchema,
  LanguageAnalysisWildcardSelectionKey,
  LanguageAnalysisSelectionSchema,
  type LanguageAnalysisSelectionWrite,
  LanguageAnalysisSelectionWriteSchema,
  toLanguageAnalysisSelectionKey,
} from "#/schema/language-analysis-requirement.ts";

// Term recall schema
export {
  type ConceptContext,
  ConceptContextSchema,
  type EnrichedTermMatch,
  EnrichedTermMatchSchema,
  type TermRecallCandidate,
  TermRecallCandidateSchema,
  type TermRecallResult,
  TermRecallResultSchema,
  type TermRecallStreamEvent,
  TermRecallStreamEventSchema,
  type TermMatch,
  TermMatchSchema,
} from "#/schema/term-recall.ts";

// Recall schema
export {
  type CandidateChannel,
  CandidateChannelSchema,
  CandidateChannelValues,
  type CandidateChannelCapability,
  CandidateChannelCapabilitySchema,
  CandidateChannelCapabilityValues,
  type CandidateChannelOutcome,
  type CandidateChannelOutcomes,
  type CandidateChannelBlocker,
  CandidateChannelBlockerSchema,
  CandidateChannelBlockerReasonSchema,
  CandidateChannelBlockerReasonValues,
  type CandidateChannelOutcomeStatus,
  CandidateChannelOutcomeStatusSchema,
  CandidateChannelOutcomeStatusValues,
  type CandidateChannelRequest,
  CandidateChannelRequestSchema,
  type CandidateRecallResult,
  type CandidateChannelSkipReason,
  CandidateChannelSkipReasonSchema,
  CandidateChannelSkipReasonValues,
  createCandidateChannelOutcomeSchema,
  createCandidateRecallResultSchema,
  createCandidateRecallStreamEventSchema,
  createCandidateStreamEventSchema,
  type EvidencedRecallCandidate,
  type NonEmptyRecallCandidates,
  type RecallDebugContext,
  RecallDebugContextSchema,
  type RecallEvidence,
  RecallEvidenceSchema,
  type RecallDerivationAffectedTarget,
  RecallDerivationAffectedTargetSchema,
} from "#/schema/recall.ts";
export {
  MemoryRecallCandidateSchema,
  MemoryRecallResultSchema,
  MemoryRecallStreamEventSchema,
  type MemoryRecallCandidate,
  type MemoryRecallResult,
  type MemoryRecallStreamEvent,
} from "#/schema/memory-recall.ts";
export {
  EffectiveMemoryRecallResultSchema,
  EffectiveMemoryRecallStreamEventSchema,
  type EffectiveMemoryRecallResult,
  type EffectiveMemoryRecallStreamEvent,
} from "#/schema/effective-memory-recall.ts";

// Precision-recall schema
export {
  type AmbiguityEnvelope,
  AmbiguityEnvelopeSchema,
  type AnchorSignature,
  AnchorSignatureSchema,
  type BudgetClass,
  BudgetClassSchema,
  type CandidateTopicAssignment,
  CandidateTopicAssignmentSchema,
  type EvidenceLane,
  EvidenceLaneSchema,
  EvidenceLaneValues,
  type MemoryTopicBinding,
  MemoryTopicBindingSchema,
  type ProviderStatus,
  ProviderStatusSchema,
  type QueryProfile,
  QueryProfileSchema,
  type QueryTopicConfidence,
  QueryTopicConfidenceSchema,
  type QueryTopicHypothesis,
  QueryTopicHypothesisSchema,
  type RankingDecision,
  RankingDecisionSchema,
  type ScopeEnvelope,
  ScopeEnvelopeSchema,
  type TopicMatchState,
  TopicMatchStateSchema,
} from "#/schema/precision-recall.ts";

// Project setting schema
export {
  ProjectSettingPatchSchema,
  type ProjectSettingPayload,
  ProjectSettingPayloadSchema,
} from "#/schema/project-setting.ts";

// Rerank schema
export {
  type RerankBand,
  RerankBandSchema,
  type RerankCandidateItem,
  RerankCandidateItemSchema,
  RerankContextHintsSchema,
  type RerankDecisionTrace,
  RerankDecisionTraceSchema,
  type RerankProviderCall,
  RerankProviderMetadataSchema,
  type RerankRequest,
  RerankRequestSchema,
  type RerankResponse,
  RerankResponseSchema,
  RerankScoreEntrySchema,
  RerankSurfaceSchema,
  RerankTriggerSchema,
} from "#/schema/rerank.ts";

// Collection schema (aliases to content graph schemas)
export {
  type CollectionElement,
  CollectionElementSchema,
  type CollectionEvidence,
  CollectionEvidenceSchema,
  type CollectionNode,
  CollectionNodeSchema,
  type CollectionPayload,
  CollectionPayloadSchema,
  type CollectionRelation,
  CollectionRelationEndpointSchema,
  CollectionRelationSchema,
} from "#/schema/collection.ts";

// Content graph schemas
export {
  type ContentRelationAllowedEndpointPair,
  ContentRelationAllowedEndpointPairSchema,
  ContentRelationEndpointSchema,
  type ContentRelationEndpoint,
  type ContextProfileConsumerBudget,
  ContextProfileConsumerBudgetSchema,
  type ContextProfilePayload,
  ContextProfilePayloadSchema,
  ContextProfileRelationWeightsSchema,
  type ContextProfileRelationWeights,
  CoreRelationTypeDefinitions,
  type FlattenedContextEvidence,
  FlattenedContextEvidenceSchema,
  type RegisteredRelationTypeInput,
  RegisteredRelationTypeInputSchema,
  type ScopeBindingInput,
  ScopeBindingInputSchema,
  type SemanticDiffEntryPayload,
  SemanticDiffEntryPayloadSchema,
  type StableElementIdentity,
  StableElementIdentitySchema,
  type StructuredContentNodeInput,
  StructuredContentNodeInputSchema,
  type StructuredContentPayload,
  StructuredContentPayloadSchema,
  type StructuredEvidenceInput,
  StructuredEvidenceInputSchema,
  type StructuredRelationInput,
  StructuredRelationInputSchema,
  type StructuredTranslatableElementInput,
  StructuredTranslatableElementInputSchema,
} from "#/schema/content.ts";

// Editor scope schemas
export {
  type EditorContentNodeFilter,
  EditorContentNodeFilterSchema,
  type EditorContentNodePathItem,
  EditorContentNodePathItemSchema,
  type EditorElement,
  EditorElementSchema,
  type EditorElementPageIndexQuery,
  EditorElementPageIndexQuerySchema,
  type EditorElementQuery,
  EditorElementQuerySchema,
  type EditorFirstElementQuery,
  EditorFirstElementQuerySchema,
  type ElementPriorityReasonCode,
  ElementPriorityReasonCodeSchema,
  ElementPriorityReasonCodeValues,
  type ElementPrioritySummary,
  ElementPrioritySummarySchema,
  type ElementSortMode,
  ElementSortModeSchema,
  ElementSortModeValues,
  type OperationScope,
  OperationScopeSchema,
  type EditorScope,
  EditorScopeSchema,
  type EditorScopeView,
  EditorScopeViewSchema,
  type ScopeTranslationSeed,
  ScopeTranslationSeedSchema,
  type EditorTranslationStatusFilter,
  EditorTranslationStatusFilterSchema,
  EditorTranslationStatusFilterValues,
} from "#/schema/editor.ts";

export * from "#/schema/qa-review.ts";

// ─── Hand-written schemas with filtering or aliasing ───

// Agent definition schemas (author-facing metadata only; omit deprecated aliases)
export {
  type AgentConstraints,
  AgentConstraintsSchema,
  type AgentDefinitionMetadata,
  AgentDefinitionMetadataSchema,
  type AgentLLMConfig,
  AgentLLMConfigSchema,
  type AgentPromptConfig,
  AgentPromptConfigSchema,
  type AgentScope,
  AgentScopeSchema,
  type AgentSecurityPolicy,
  AgentSecurityPolicySchema,
  type AgentSessionMetadata,
  AgentSessionMetadataSchema,
  type ConfirmationPolicy,
  ConfirmationPolicySchema,
  ConfirmationPolicyValues,
  type Orchestration,
  OrchestrationSchema,
  type ParsedAgentDefinition,
  type PipelineStage,
  PipelineStageSchema,
  type ToolConfirmRequest,
  ToolConfirmRequestSchema,
  type ToolConfirmResponse,
  ToolConfirmResponseSchema,
  type ToolExecuteRequest,
  ToolExecuteRequestSchema,
  type ToolExecuteResponse,
  ToolExecuteResponseSchema,
  serializeAgentDefinition,
} from "#/schema/agent.ts";
export {
  PluginIdentifierSchema,
  ServiceIdentifierSchema,
  ScopedInstallationIdentifierSchema,
  type PluginIdentifier,
  type ServiceIdentifier,
  type ScopedInstallationIdentifier,
} from "#/schema/plugin-identifier.ts";

// Enum schemas (all values; these are canonical here)
export {
  TokenTypeValues,
  TokenTypeSchema,
  type TokenType,
  TaskStatusValues,
  TaskStatusSchema,
  type TaskStatus,
  TaskScopeTypeValues,
  TaskScopeTypeSchema,
  type TaskScopeType,
  TaskKindValues,
  TaskKindNameSchema,
  type TaskKindName,
  GlossaryTermWriteOperationValues,
  GlossaryTermWriteOperationSchema,
  type GlossaryTermWriteOperation,
  WorkflowTaskDispatchStatusValues,
  WorkflowTaskDispatchStatusSchema,
  type WorkflowTaskDispatchStatus,
  BatchAutoTranslationTaskPhaseValues,
  BatchAutoTranslationTaskPhaseSchema,
  type BatchAutoTranslationTaskPhase,
  RecallDerivationTaskPhaseValues,
  RecallDerivationTaskPhaseSchema,
  type RecallDerivationTaskPhase,
  TaskActorTypeValues,
  TaskActorTypeSchema,
  type TaskActorType,
  TaskAffectedResourceTypeValues,
  TaskAffectedResourceTypeSchema,
  type TaskAffectedResourceType,
  OperationFailureCodeValues,
  OperationFailureCodeSchema,
  type OperationFailureCode,
  OperationFailureSeverityValues,
  OperationFailureSeveritySchema,
  type OperationFailureSeverity,
  OperationFailureBlockerValues,
  OperationFailureBlockerSchema,
  type OperationFailureBlocker,
  OperationFailureCapabilityValues,
  OperationFailureCapabilitySchema,
  type OperationFailureCapability,
  OperationFailureAuthorizationDecisionValues,
  OperationFailureAuthorizationDecisionSchema,
  type OperationFailureAuthorizationDecision,
  OperationFailureRedactionBoundaryValues,
  OperationFailureRedactionBoundarySchema,
  type OperationFailureRedactionBoundary,
  QueueTaskStatusValues,
  QueueTaskStatusSchema,
  type QueueTaskStatus,
  PluginServiceTypeValues,
  PluginServiceTypeSchema,
  type PluginServiceType,
  ScopeTypeValues,
  ScopeTypeSchema,
  type ScopeType,
  ResourceTypeValues,
  ResourceTypeSchema,
  type ResourceType,
  TranslatableElementContextTypeValues,
  TranslatableElementContextTypeSchema,
  type TranslatableElementContextType,
  CommentReactionTypeValues,
  CommentReactionTypeSchema,
  type CommentReactionType,
  CommentTargetTypeValues,
  CommentTargetTypeSchema,
  type CommentTargetType,
  TermTypeValues,
  TermTypeSchema,
  type TermType,
  TermStatusValues,
  TermStatusSchema,
  type TermStatus,
  AgentSessionStatusValues,
  AgentSessionStatusSchema,
  type AgentSessionStatus,
  AgentToolTargetValues,
  AgentToolTargetSchema,
  type AgentToolTarget,
  AgentToolConfirmationStatusValues,
  AgentToolConfirmationStatusSchema,
  type AgentToolConfirmationStatus,
  AgentSessionTrustPolicyValues,
  AgentSessionTrustPolicySchema,
  type AgentSessionTrustPolicy,
  AgentDefinitionTypeValues,
  AgentDefinitionTypeSchema,
  type AgentDefinitionType,
  ObjectTypeValues,
  ObjectTypeSchema,
  type ObjectType,
  SubjectTypeValues,
  SubjectTypeSchema,
  type SubjectType,
  RelationValues,
  RelationSchema,
  type Relation,
  PermissionActionValues,
  PermissionActionSchema,
  type PermissionAction,
  MessageChannelValues,
  MessageChannelSchema,
  type MessageChannel,
  MessageCategoryValues,
  MessageCategorySchema,
  type MessageCategory,
  NotificationStatusValues,
  NotificationStatusSchema,
  type NotificationStatus,
  IssueStatusValues,
  IssueStatusSchema,
  type IssueStatus,
  PullRequestStatusValues,
  PullRequestStatusSchema,
  type PullRequestStatus,
  PullRequestTypeValues,
  PullRequestTypeSchema,
  type PullRequestType,
  EntityBranchStatusValues,
  EntityBranchStatusSchema,
  type EntityBranchStatus,
  IssueCommentTargetTypeValues,
  IssueCommentTargetTypeSchema,
  type IssueCommentTargetType,
  CrossReferenceSourceTypeValues,
  CrossReferenceSourceTypeSchema,
  type CrossReferenceSourceType,
  CrossReferenceTargetTypeValues,
  CrossReferenceTargetTypeSchema,
  type CrossReferenceTargetType,
  ChangesetStatusValues,
  ChangesetStatusSchema,
  type ChangesetStatus,
  EntityTypeValues,
  EntityTypeSchema,
  type EntityType,
  ChangeActionValues,
  ChangeActionSchema,
  type ChangeAction,
  RiskLevelValues,
  RiskLevelSchema,
  type RiskLevel,
  ReviewStatusValues,
  ReviewStatusSchema,
  type ReviewStatus,
  QaReviewRunLayerValues,
  QaReviewRunLayerSchema,
  type QaReviewRunLayer,
  QaReviewRunStatusValues,
  QaReviewRunStatusSchema,
  type QaReviewRunStatus,
  QaFindingActionValues,
  QaFindingActionSchema,
  type QaFindingAction,
  QaFindingDispositionValues,
  QaFindingDispositionSchema,
  type QaFindingDisposition,
  QaReviewRiskBucketValues,
  QaReviewRiskBucketSchema,
  type QaReviewRiskBucket,
  QaReviewQueueStatusValues,
  QaReviewQueueStatusSchema,
  type QaReviewQueueStatus,
  QaReviewAnnotationIntentValues,
  QaReviewAnnotationIntentSchema,
  type QaReviewAnnotationIntent,
  QaReviewAnnotationStatusValues,
  QaReviewAnnotationStatusSchema,
  type QaReviewAnnotationStatus,
  QaReviewDecisionTypeValues,
  QaReviewDecisionTypeSchema,
  type QaReviewDecisionType,
  QaReviewSuggestionStatusValues,
  QaReviewSuggestionStatusSchema,
  type QaReviewSuggestionStatus,
  QaReviewNotificationTypeValues,
  QaReviewNotificationTypeSchema,
  type QaReviewNotificationType,
  AsyncStatusValues,
  AsyncStatusSchema,
  type AsyncStatus,
  ChangesetEntryAsyncStatusValues,
  ChangesetEntryAsyncStatusSchema,
  type ChangesetEntryAsyncStatus,
  RecallVariantTypeValues,
  RecallVariantTypeSchema,
  type RecallVariantType,
  RecallQuerySideValues,
  RecallQuerySideSchema,
  type RecallQuerySide,
  RecallDerivationStatusValues,
  RecallDerivationStatusSchema,
  type RecallDerivationStatus,
  RecallDerivationTargetKindValues,
  RecallDerivationTargetKindSchema,
  type RecallDerivationTargetKind,
  MemoryScopeValues,
  MemoryScopeSchema,
  type MemoryScope,
  MemoryPromotionStatusValues,
  MemoryPromotionStatusSchema,
  type MemoryPromotionStatus,
  MemoryDeletionScopeValues,
  MemoryDeletionScopeSchema,
  type MemoryDeletionScope,
  ContentBoundaryTypeSchema,
  ContentBoundaryTypeValues,
  type ContentBoundaryType,
  ContentEvidenceKindSchema,
  ContentEvidenceKindValues,
  type ContentEvidenceKind,
  ContentIdentityStatusSchema,
  ContentIdentityStatusValues,
  type ContentIdentityStatus,
  ContentNodeExportRoleSchema,
  ContentNodeExportRoleValues,
  type ContentNodeExportRole,
  ContentNodeKindSchema,
  ContentNodeKindValues,
  type ContentNodeKind,
  ContentNodeLifecycleStatusSchema,
  ContentNodeLifecycleStatusValues,
  type ContentNodeLifecycleStatus,
  ContentRelationDirectionalitySchema,
  ContentRelationDirectionalityValues,
  type ContentRelationDirectionality,
  ContentRelationLifecycleStatusSchema,
  ContentRelationLifecycleStatusValues,
  type ContentRelationLifecycleStatus,
  ContentRelationSemanticFamilySchema,
  ContentRelationSemanticFamilyValues,
  type ContentRelationSemanticFamily,
  ContextConsumerPurposeSchema,
  ContextConsumerPurposeValues,
  type ContextConsumerPurpose,
  EvidenceTrustLevelSchema,
  EvidenceTrustLevelValues,
  type EvidenceTrustLevel,
  RelationEndpointKindSchema,
  RelationEndpointKindValues,
  type RelationEndpointKind,
  ScopeBindingAssetKindSchema,
  ScopeBindingAssetKindValues,
  type ScopeBindingAssetKind,
  ScopeBindingModeSchema,
  ScopeBindingModeValues,
  type ScopeBindingMode,
  SemanticDiffKindSchema,
  SemanticDiffKindValues,
  type SemanticDiffKind,
  VectorInvalidationReasonSchema,
  VectorInvalidationReasonValues,
  type VectorInvalidationReason,
} from "#/schema/enum.ts";

// Permission schemas (filtering out duplicates already canonical in enum.ts)
export {
  PermissionCheckSchema,
  type PermissionCheck,
  GrantPermissionSchema,
  type GrantPermission,
} from "#/schema/permission.ts";

// ─── Generated Drizzle schema modules ───

export {
  type LanguageAnalysisObservationRecord,
  LanguageAnalysisObservationRecordSchema,
  type LanguageAnalysisSelectionRecord,
  LanguageAnalysisSelectionRecordSchema,
} from "#/schema/drizzle/language-analysis.ts";

// API key / session schemas
export {
  type ApiKey,
  ApiKeySchema,
  type SessionRecord,
  SessionRecordSchema,
} from "#/schema/drizzle/api-key.ts";

// Changeset schemas
export {
  type Changeset,
  type ChangesetEntry,
  ChangesetEntrySchema,
  ChangesetSchema,
  type EntitySnapshot,
  EntitySnapshotSchema,
} from "#/schema/drizzle/changeset.ts";

// Comment schemas
export {
  type Comment,
  type CommentReaction,
  CommentReactionSchema,
  CommentSchema,
} from "#/schema/drizzle/comment.ts";

// Content graph schemas
export {
  type ContentNode,
  ContentNodeSchema,
  type ContentNodeToTask,
  ContentNodeToTaskSchema,
  type ContentRelation,
  ContentRelationSchema,
  type ContentRelationType,
  ContentRelationTypeSchema,
  type ContextEvidence,
  ContextEvidenceSchema,
  type ContextProfile,
  ContextProfileSchema,
  type ScopeBinding,
  ScopeBindingSchema,
  type SemanticDiffEntry,
  SemanticDiffEntrySchema,
  type TranslatableElement,
  TranslatableElementSchema,
  type VectorizedString,
  VectorizedStringSchema,
} from "#/schema/drizzle/content.ts";

// Entity branch schemas
export {
  type EntityBranch,
  EntityBranchSchema,
} from "#/schema/drizzle/entity-branch.ts";

// Glossary schemas
export {
  type Glossary,
  GlossarySchema,
  type GlossaryToProject,
  GlossaryToProjectSchema,
  type Term,
  type TermConcept,
  TermConceptSchema,
  type TermConceptSubject,
  TermConceptSubjectSchema,
  type TermConceptToSubject,
  TermConceptToSubjectSchema,
  type TermRecallVariant,
  TermRecallVariantSchema,
  TermSchema,
} from "#/schema/drizzle/glossary.ts";

// Issue comment schemas
export {
  type CrossReference,
  CrossReferenceSchema,
  type IssueComment,
  IssueCommentSchema,
  type IssueCommentThread,
  IssueCommentThreadSchema,
} from "#/schema/drizzle/issue-comment.ts";

// Issue schemas
export {
  type Issue,
  type IssueLabel,
  IssueLabelSchema,
  IssueSchema,
  type ProjectSequence,
  ProjectSequenceSchema,
} from "#/schema/drizzle/issue.ts";

// Memory schemas
export {
  type Memory,
  type MemoryItem,
  MemoryItemSchema,
  MemoryRecallVariantSchema,
  type MemoryRecallVariant,
  MemorySchema,
  type MemoryToProject,
  MemoryToProjectSchema,
  type SlotMappingEntry,
  SlotMappingEntrySchema,
} from "#/schema/drizzle/memory.ts";

// Misc DB schemas
export {
  type Language,
  LanguageSchema,
  type RuntimeCacheEntry,
  RuntimeCacheEntrySchema,
  type RuntimeQueueTask,
  RuntimeQueueTaskSchema,
  type RuntimeSessionEntry,
  RuntimeSessionEntrySchema,
  type Setting,
  SettingSchema,
  type Task,
  TaskSchema,
} from "#/schema/drizzle/misc.ts";

// Plugin DB schemas
export {
  type Plugin,
  type PluginComponent,
  PluginComponentSchema,
  type PluginConfig,
  type PluginConfigInstance,
  PluginConfigInstanceSchema,
  PluginConfigSchema,
  type PluginInstallation,
  PluginInstallationSchema,
  type PluginPermission,
  PluginPermissionSchema,
  PluginSchema,
  type PluginService,
  PluginServiceSchema,
  type PluginVersion,
  PluginVersionSchema,
} from "#/schema/drizzle/plugin.ts";

// Project schemas
export {
  type Project,
  ProjectSchema,
  type ProjectTargetLanguage,
  ProjectTargetLanguageSchema,
} from "#/schema/drizzle/project.ts";

// Pull request schemas
export {
  type PullRequest,
  PullRequestSchema,
} from "#/schema/drizzle/pull-request.ts";

// QA schemas
export {
  type QaResult,
  type QaResultItem,
  type QaReviewAnnotation,
  QaReviewAnnotationSchema,
  type QaReviewDecision,
  QaReviewDecisionSchema,
  type QaReviewFinding,
  QaReviewFindingSchema,
  type QaReviewProfile,
  QaReviewProfileSchema,
  type QaReviewQueueItem,
  QaReviewQueueItemSchema,
  type QaReviewRun,
  QaReviewRunSchema,
  type QaReviewSuggestion,
  QaReviewSuggestionSchema,
  QaResultItemSchema,
  QaResultSchema,
} from "#/schema/drizzle/qa.ts";

// Translation schemas
export {
  type Translation,
  TranslationSchema,
  type TranslationSnapshot,
  type TranslationSnapshotItem,
  TranslationSnapshotItemSchema,
  TranslationSnapshotSchema,
  type TranslationVote,
  TranslationVoteSchema,
} from "#/schema/drizzle/translation.ts";

// User schemas
export {
  type Account,
  AccountSchema,
  type MFAProvider,
  MFAProviderSchema,
  type User,
  UserSchema,
} from "#/schema/drizzle/user.ts";

// Vector schemas
export {
  type Chunk,
  ChunkSchema,
  type ChunkSet,
  ChunkSetSchema,
  type Vector,
  VectorSchema,
} from "#/schema/drizzle/vector.ts";

// ─── Generated Drizzle schemas with filtering or aliasing ───

// Stored agent row schemas (already named StoredAgentDefinitionSchema by the generator)
export {
  StoredAgentDefinitionSchema,
  type StoredAgentDefinition,
  AgentSessionSchema,
  type AgentSession,
  AgentRunSchema,
  type AgentRun,
  AgentEventSchema,
  type AgentEvent,
  AgentExternalOutputSchema,
  type AgentExternalOutput,
  ToolCallLogSchema,
  type ToolCallLog,
} from "#/schema/drizzle/agent.ts";

// BlobSchema remains internal because storage blobs are not part of the shared root contract.
export { FileSchema, type File } from "#/schema/drizzle/file.ts";

// ─── Utilities ───

export { chunk, chunkDual, getIndex, zip } from "#/utils/array.ts";

export {
  AssertError,
  assertFirstNonNullish,
  assertFirstOrNull,
  assertKeysNonNullish,
  assertPromise,
  assertSingleNonNullish,
  assertSingleOrNull,
} from "#/utils/assert.ts";

export { summarizeError } from "#/utils/error.ts";

export { sanitizeFileName } from "#/utils/file.ts";

export {
  type HTTPHelpers,
  createHTTPHelpers,
  shouldUseSecureCookies,
  type delCookie,
  type getCookie,
  getCookieFunc,
  type getQueryParam,
  getQueryParamFunc,
  type getReqHeader,
  type setCookie,
  type setResHeader,
} from "#/utils/http-helpers.ts";

export { getDefaultFromSchema } from "#/utils/json-schema.ts";

export {
  type DiagnosticErrorTreeAnnotationResolver,
  formatDiagnosticErrorTree,
  type FormatDiagnosticErrorTreeOptions,
  Logger,
  logger,
  redactDiagnosticText,
} from "#/utils/logger/core.ts";

export {
  type DiagnosticContext,
  type DiagnosticEvent,
  type DiagnosticFields,
  type DiagnosticObserver,
  type DiagnosticTransport,
  type LogLevel,
} from "#/utils/logger/types.ts";

export { summarize } from "#/utils/object.ts";

export { resolveRouteTemplate } from "#/utils/resolve-route-template.ts";

export { useStringTemplate } from "#/utils/string-template.ts";

export {
  compareCodeUnitStrings,
  parsePreferredLanguage,
  toShortFixed,
} from "#/utils/string.ts";

export { safeJoinURL } from "#/utils/url.ts";
