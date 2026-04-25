// ─── Hand-written schema modules ───

// Custom element schema
export { CustomElementNameSchema } from "./schema/ce.ts";

// Extraction schema
export {
  type CaptureResult,
  CaptureResultMetadataSchema,
  type CaptureResultMetadata,
  CaptureResultSchema,
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
} from "./schema/extraction.ts";

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
} from "./schema/json.ts";

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
} from "./schema/misc.ts";

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
} from "./schema/plugin.ts";

// NLP schema
export {
  type NlpBatchSegmentResult,
  NlpBatchSegmentResultSchema,
  type NlpSegmentResult,
  NlpSegmentResultSchema,
  type NlpSentence,
  NlpSentenceSchema,
  type NlpToken,
  NlpTokenSchema,
} from "./schema/nlp.ts";

// Term recall schema
export {
  type ConceptContext,
  ConceptContextSchema,
  type EnrichedTermMatch,
  EnrichedTermMatchSchema,
  type TermMatch,
  TermMatchSchema,
} from "./schema/term-recall.ts";

// Recall schema
export {
  type RecallChannel,
  RecallChannelSchema,
  RecallChannelValues,
  type RecallDebugContext,
  RecallDebugContextSchema,
  type RecallEvidence,
  RecallEvidenceSchema,
} from "./schema/recall.ts";

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
} from "./schema/precision-recall.ts";

// Project setting schema
export {
  ProjectSettingPatchSchema,
  type ProjectSettingPayload,
  ProjectSettingPayloadSchema,
} from "./schema/project-setting.ts";

// Memory-recall schema
export {
  type MemoryRecallBm25CapabilityDirectory,
  MemoryRecallBm25CapabilityDirectorySchema,
  type MemoryRecallBm25CapabilityEntry,
  MemoryRecallBm25CapabilityEntrySchema,
  type MemoryRecallBm25CapabilityQuery,
  MemoryRecallBm25CapabilityQuerySchema,
  type MemoryRecallBm25CompressionProfile,
  MemoryRecallBm25CompressionProfileSchema,
} from "./schema/memory-recall.ts";

// Rerank schema
export {
  type RerankBand,
  RerankBandSchema,
  type RerankCandidateDocument,
  RerankCandidateDocumentSchema,
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
} from "./schema/rerank.ts";

// Collection schema (TranslatableElementContextTypeSchema is canonical in enum.ts; do not re-export the passthrough here)
export {
  type CollectionContext,
  type CollectionContextData,
  CollectionContextDataFileSchema,
  CollectionContextDataImageSchema,
  CollectionContextDataJsonSchema,
  CollectionContextDataMarkdownSchema,
  CollectionContextDataSchema,
  CollectionContextDataTextSchema,
  CollectionContextDataUrlSchema,
  CollectionContextSchema,
  type CollectionElement,
  type CollectionElementLocation,
  CollectionElementLocationSchema,
  CollectionElementSchema,
  type CollectionPayload,
  CollectionPayloadSchema,
} from "./schema/collection.ts";

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
} from "./schema/agent.ts";

// Enum schemas (all values; these are canonical here)
export {
  TokenTypeValues,
  TokenTypeSchema,
  type TokenType,
  TaskStatusValues,
  TaskStatusSchema,
  type TaskStatus,
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
} from "./schema/enum.ts";

// Permission schemas (filtering out duplicates already canonical in enum.ts)
export {
  PermissionCheckSchema,
  type PermissionCheck,
  GrantPermissionSchema,
  type GrantPermission,
} from "./schema/permission.ts";

// ─── Generated Drizzle schema modules ───

// API key / session schemas
export {
  type ApiKey,
  ApiKeySchema,
  type SessionRecord,
  SessionRecordSchema,
} from "./schema/drizzle/api-key.ts";

// Changeset schemas
export {
  type Changeset,
  type ChangesetEntry,
  ChangesetEntrySchema,
  ChangesetSchema,
  type EntitySnapshot,
  EntitySnapshotSchema,
} from "./schema/drizzle/changeset.ts";

// Comment schemas
export {
  type Comment,
  type CommentReaction,
  CommentReactionSchema,
  CommentSchema,
} from "./schema/drizzle/comment.ts";

// Document schemas
export {
  type Document,
  type DocumentClosure,
  DocumentClosureSchema,
  DocumentSchema,
  type DocumentToTask,
  DocumentToTaskSchema,
  type TranslatableElement,
  type TranslatableElementContext,
  TranslatableElementContextSchema,
  TranslatableElementSchema,
  type VectorizedString,
  VectorizedStringSchema,
} from "./schema/drizzle/document.ts";

// Entity branch schemas
export {
  type EntityBranch,
  EntityBranchSchema,
} from "./schema/drizzle/entity-branch.ts";

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
} from "./schema/drizzle/glossary.ts";

// Issue comment schemas
export {
  type CrossReference,
  CrossReferenceSchema,
  type IssueComment,
  IssueCommentSchema,
  type IssueCommentThread,
  IssueCommentThreadSchema,
} from "./schema/drizzle/issue-comment.ts";

// Issue schemas
export {
  type Issue,
  type IssueLabel,
  IssueLabelSchema,
  IssueSchema,
  type ProjectSequence,
  ProjectSequenceSchema,
} from "./schema/drizzle/issue.ts";

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
} from "./schema/drizzle/memory.ts";

// Misc DB schemas
export {
  type Language,
  LanguageSchema,
  type Setting,
  SettingSchema,
  type Task,
  TaskSchema,
} from "./schema/drizzle/misc.ts";

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
} from "./schema/drizzle/plugin.ts";

// Project schemas
export {
  type Project,
  ProjectSchema,
  type ProjectTargetLanguage,
  ProjectTargetLanguageSchema,
} from "./schema/drizzle/project.ts";

// Pull request schemas
export {
  type PullRequest,
  PullRequestSchema,
} from "./schema/drizzle/pull-request.ts";

// QA schemas
export {
  type QaResult,
  type QaResultItem,
  QaResultItemSchema,
  QaResultSchema,
} from "./schema/drizzle/qa.ts";

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
} from "./schema/drizzle/translation.ts";

// User schemas
export {
  type Account,
  AccountSchema,
  type MFAProvider,
  MFAProviderSchema,
  type User,
  UserSchema,
} from "./schema/drizzle/user.ts";

// Vector schemas
export {
  type Chunk,
  ChunkSchema,
  type ChunkSet,
  ChunkSetSchema,
  type Vector,
  VectorSchema,
} from "./schema/drizzle/vector.ts";

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
} from "./schema/drizzle/agent.ts";

// File schemas (BlobSchema omitted: hash: z.instanceof(Buffer) is not browser-safe)
export { FileSchema, type File } from "./schema/drizzle/file.ts";

// ─── Utilities ───

export { chunk, chunkDual, getIndex, zip } from "./utils/array.ts";

export {
  AssertError,
  assertFirstNonNullish,
  assertFirstOrNull,
  assertKeysNonNullish,
  assertPromise,
  assertSingleNonNullish,
  assertSingleOrNull,
} from "./utils/assert.ts";

export { summarizeError } from "./utils/error.ts";

export { sanitizeFileName } from "./utils/file.ts";

export {
  type HTTPHelpers,
  createHTTPHelpers,
  type delCookie,
  type getCookie,
  getCookieFunc,
  type getQueryParam,
  getQueryParamFunc,
  type getReqHeader,
  type setCookie,
  type setResHeader,
} from "./utils/http-helpers.ts";

export { getDefaultFromSchema } from "./utils/json-schema.ts";

export { Logger, TypedLogger, logger } from "./utils/logger/core.ts";

export {
  type LogEntry,
  type LogLevel,
  type LoggerTransport,
  type OutputSituation,
} from "./utils/logger/types.ts";

export { summarize } from "./utils/object.ts";

export { resolveRouteTemplate } from "./utils/resolve-route-template.ts";

export { useStringTemplate } from "./utils/string-template.ts";

export { parsePreferredLanguage, toShortFixed } from "./utils/string.ts";

export { safeJoinURL } from "./utils/url.ts";
