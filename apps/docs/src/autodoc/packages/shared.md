# @cat/shared

Shared Zod schemas, type definitions, and utility functions

## Overview

* **Modules**: 48

* **Exported functions**: 25

* **Exported types**: 291

## Function Index

### packages/shared/src/schema

### `serializeAgentDefinition`

```ts
/**
 * Serialize agent metadata and body content into a complete MD text.
 *
 * @param parsed - Parsed agent definition
 *
 * @returns Full MD string with YAML frontmatter and body
 */
export const serializeAgentDefinition = (parsed: ParsedAgentDefinition): string
```

### packages/shared/src/utils

### `chunkGenerator`

```ts
export function chunkGenerator(arr: T[], size: number): Generator<T[], any, any>
```

### `dualChunkGenerator`

```ts
export function dualChunkGenerator(arr1: A[], arr2: B[], size: number): Generator<[A[], B[]], any, any>
```

### `chunk`

```ts
export function chunk(arr: T[], size: number): { index: number; chunk: T[]; }[]
```

### `chunkDual`

```ts
export function chunkDual(arr1: A[], arr2: B[], size: number): { index: number; chunk: { arr1: A[]; arr2: B[]; }; }[]
```

### `getIndex`

```ts
export const getIndex = (arr: T[], index: number): T
```

### `zip`

```ts
/**
 * 输入任意个长度相同的数组 a, b, c...
 * 输出由每个数组同一位置元素组成的数组的迭代器
 */
export const zip = (arrays: T): Iterable<RowOf<T>>
```

### `assertFirstOrNull`

```ts
export const assertFirstOrNull = (arr: T[], message?: string): T | null
```

### `assertSingleOrNull`

```ts
export const assertSingleOrNull = (arr: T[], message?: string): T | null
```

### `assertPromise`

```ts
/**
 * Assert that the given async predicate resolves successfully. \
 * If it rejects, throw an AssertError with the given message and the original error as leadTo.
 * @param 
 * @param
 */
export const assertPromise = async (predicate: () => Promise<unknown>, message: string): Promise<void>
```

### `assertFirstNonNullish`

```ts
export const assertFirstNonNullish = (arr: T[], message?: string): T
```

### `assertSingleNonNullish`

```ts
export const assertSingleNonNullish = (arr: T[], message?: string): T
```

### `assertKeysNonNullish`

```ts
export const assertKeysNonNullish = (obj: T, keys: readonly K[], message?: string)
```

### `summarizeError`

```ts
export const summarizeError = (error: unknown): unknown
```

### `sanitizeFileName`

```ts
export const sanitizeFileName = (name: string): string
```

### `createHTTPHelpers`

```ts
export const createHTTPHelpers = (req: Request, resHeaders: Headers): { setCookie: setCookie; delCookie: delCookie; getCookie: getCookie; getQueryParam: getQueryParam; getReqHeader: getReqHeader; setResHeader: setResHeader; }
```

### `getCookieFunc`

```ts
export const getCookieFunc = (cookies: string): getCookie
```

### `getQueryParamFunc`

```ts
export const getQueryParamFunc = (url: string): getQueryParam
```

### `getDefaultFromSchema`

```ts
export const getDefaultFromSchema = (schema: JSONSchema): JSONType | undefined
```

### `summarize`

```ts
/**
 * 辅助函数：折叠大对象用于日志输出
 * - 数组显示为 Array(N)
 * - 对象显示为 {Object}
 * - 长字符串截断
 */
export const summarize = (obj: unknown): unknown
```

### `resolveRouteTemplate`

```ts
/**
 * Resolve `$ref:<name>` placeholders in a route template string using the provided bindings.
 *
 * Placeholder syntax: `$ref:<name>` where <name> extends to the next `/` or end of string.
 * Allowed characters in name: letters, digits, `:`, `-`, `_`.
 * @throws Error listing all missing binding names if any placeholder cannot be resolved.
 */
export function resolveRouteTemplate(template: string, bindings: Record<string, string>): string
```

### `useStringTemplate`

```ts
export const useStringTemplate = (template: string, ctx: Record<string, string | (() => string) | Date | number>): string
```

### `toShortFixed`

```ts
export const toShortFixed = (num: number, fractionDigits: number): string
```

### `parsePreferredLanguage`

```ts
export const parsePreferredLanguage = (acceptLanguage: string): string | null
```

### `safeJoinURL`

```ts
export const safeJoinURL = (base: string, path: string): string
```

## Type Index

* `ParsedAgentDefinition` (interface) — Full agent definition parsed from MD (metadata + body content).

* `AgentDefinitionMetadata` (type) — Agent definition metadata type.

* `AgentLLMConfig` (type) — Agent LLM configuration type.

* `AgentConstraints` (type) — Agent runtime constraints type.

* `AgentPromptConfig` (type) — Agent prompt configuration type.

* `AgentSecurityPolicy` (type) — Agent security policy type.

* `AgentScope` (type) — Agent scope type.

* `AgentSessionMetadata` (type) — Agent session metadata type.

* `Orchestration` (type) — Multi-agent orchestration configuration type.

* `PipelineStage` (type) — Orchestration pipeline stage type.

* `AgentDefinition` (type) — @deprecated Use AgentDefinitionMetadata instead.

* `SystemPromptVariable` (type) — @deprecated Use ParsedAgentDefinition instead.

* `ToolConfirmRequest` (type)

* `ToolConfirmResponse` (type)

* `ToolExecuteRequest` (type)

* `ToolExecuteResponse` (type)

* `ConfirmationPolicy` (type)

* `StableElementIdentity` (type)

* `ContentRelationEndpoint` (type)

* `ContentRelationAllowedEndpointPair` (type)

* `RegisteredRelationTypeInput` (type)

* `StructuredContentNodeInput` (type)

* `StructuredTranslatableElementInput` (type)

* `StructuredRelationInput` (type)

* `StructuredEvidenceInput` (type)

* `StructuredContentPayload` (type)

* `ContextProfileRelationWeights` (type)

* `ContextProfileConsumerBudget` (type)

* `ContextProfilePayload` (type)

* `FlattenedContextEvidence` (type)

* `ScopeBindingInput` (type)

* `SemanticDiffEntryPayload` (type)

* `StoredAgentDefinition` (type)

* `AgentSession` (type)

* `AgentRun` (type)

* `AgentEvent` (type)

* `AgentExternalOutput` (type)

* `ToolCallLog` (type)

* `ApiKey` (type)

* `SessionRecord` (type)

* `Changeset` (type)

* `ChangesetEntry` (type)

* `EntitySnapshot` (type)

* `Comment` (type)

* `CommentReaction` (type)

* `ContentNode` (type)

* `ContentRelationType` (type)

* `ContentRelation` (type)

* `ContentNodeToTask` (type)

* `TranslatableElement` (type)

* `VectorizedString` (type)

* `ContextEvidence` (type)

* `ContextProfile` (type)

* `ScopeBinding` (type)

* `SemanticDiffEntry` (type)

* `EntityBranch` (type)

* `File` (type)

* `Blob` (type)

* `Glossary` (type)

* `GlossaryToProject` (type)

* `Term` (type)

* `TermConcept` (type)

* `TermConceptToSubject` (type)

* `TermConceptSubject` (type)

* `TermRecallVariant` (type)

* `IssueCommentThread` (type)

* `IssueComment` (type)

* `CrossReference` (type)

* `ProjectSequence` (type)

* `Issue` (type)

* `IssueLabel` (type)

* `SlotMappingEntry` (type)

* `Memory` (type)

* `MemoryItem` (type)

* `MemoryToProject` (type)

* `PersonalMemoryBinding` (type)

* `MemoryPromotionRecord` (type)

* `MemoryItemDeletion` (type)

* `MemoryRecallVariant` (type)

* `Language` (type)

* `Task` (type)

* `Setting` (type)

* `RuntimeCacheEntry` (type)

* `RuntimeSessionEntry` (type)

* `RuntimeQueueTask` (type)

* `Plugin` (type)

* `PluginInstallation` (type)

* `PluginConfig` (type)

* `PluginConfigInstance` (type)

* `PluginService` (type)

* `PluginComponent` (type)

* `PluginPermission` (type)

* `PluginVersion` (type)

* `Project` (type)

* `ProjectTargetLanguage` (type)

* `PullRequest` (type)

* `QaResult` (type)

* `QaResultItem` (type)

* `QaReviewProfile` (type)

* `QaReviewRun` (type)

* `QaReviewFinding` (type)

* `QaReviewQueueItem` (type)

* `QaReviewAnnotation` (type)

* `QaReviewSuggestion` (type)

* `QaReviewDecision` (type)

* `Translation` (type)

* `TranslationVote` (type)

* `TranslationSnapshot` (type)

* `TranslationSnapshotItem` (type)

* `User` (type)

* `Account` (type)

* `MFAProvider` (type)

* `ChunkSet` (type)

* `Chunk` (type)

* `Vector` (type)

* `EditorTranslationStatusFilter` (type) — Editor translation-status filter type.

* `ElementSortMode` (type) — Element sort-mode type.

* `ElementPriorityReasonCode` (type) — Priority reason-code type.

* `ElementPrioritySummary` (type) — Lightweight priority summary type for one element.

* `ScopeTranslationSeed` (type) — Runtime-only context seed type for batch auto-translation.

* `EditorScope` (type) — Editor scope type.

* `OperationScope` (type) — Batch operation scope type.

* `EditorElementQuery` (type) — Paginated editor element-query type.

* `EditorFirstElementQuery` (type) — First-element query type.

* `EditorElementPageIndexQuery` (type) — Element page-index query type.

* `EditorContentNodePathItem` (type) — Editor content-node path-item type.

* `EditorContentNodeFilter` (type) — Editor content-node filter type.

* `EditorScopeView` (type) — Editor scope-view type.

* `EditorElement` (type) — Editor element-row type.

* `TokenType` (type)

* `QueueTaskStatus` (type)

* `ContentNodeKind` (type)

* `ContentNodeLifecycleStatus` (type)

* `ContentNodeExportRole` (type)

* `ContentBoundaryType` (type)

* `RelationEndpointKind` (type)

* `ContentRelationSemanticFamily` (type)

* `ContentRelationDirectionality` (type)

* `ContentRelationLifecycleStatus` (type)

* `EvidenceTrustLevel` (type)

* `ContentEvidenceKind` (type)

* `ContextConsumerPurpose` (type)

* `ScopeBindingAssetKind` (type)

* `ScopeBindingMode` (type)

* `SemanticDiffKind` (type)

* `VectorInvalidationReason` (type)

* `ContentIdentityStatus` (type)

* `PluginServiceType` (type)

* `ScopeType` (type)

* `TaskStatus` (type)

* `TranslatableElementContextType` (type)

* `CommentReactionType` (type)

* `ResourceType` (type)

* `CommentTargetType` (type)

* `TermType` (type)

* `TermStatus` (type)

* `AgentSessionStatus` (type)

* `ObjectType` (type)

* `SubjectType` (type)

* `Relation` (type)

* `PermissionAction` (type)

* `AgentToolTarget` (type)

* `AgentToolConfirmationStatus` (type)

* `AgentSessionTrustPolicy` (type)

* `AgentDefinitionType` (type)

* `MessageChannel` (type)

* `MessageCategory` (type)

* `NotificationStatus` (type)

* `IssueStatus` (type)

* `PullRequestStatus` (type)

* `PullRequestType` (type)

* `EntityBranchStatus` (type)

* `IssueCommentTargetType` (type)

* `CrossReferenceSourceType` (type)

* `CrossReferenceTargetType` (type)

* `ChangesetStatus` (type)

* `EntityType` (type)

* `ChangeAction` (type)

* `RiskLevel` (type)

* `ReviewStatus` (type)

* `QaReviewRunLayer` (type)

* `QaReviewRunStatus` (type)

* `QaFindingAction` (type)

* `QaFindingDisposition` (type)

* `QaReviewRiskBucket` (type)

* `QaReviewQueueStatus` (type)

* `QaReviewAnnotationIntent` (type)

* `QaReviewAnnotationStatus` (type)

* `QaReviewDecisionType` (type)

* `QaReviewSuggestionStatus` (type)

* `QaReviewNotificationType` (type)

* `AsyncStatus` (type)

* `ChangesetEntryAsyncStatus` (type)

* `RecallVariantType` (type)

* `RecallQuerySide` (type)

* `MemoryScope` (type)

* `MemoryPromotionStatus` (type)

* `MemoryDeletionScope` (type)

* `ExtractionResult` (type)

* `ExtractionMetadata` (type)

* `NavigationStep` (type)

* `RouteEntry` (type)

* `RouteManifest` (type)

* `CaptureResult` (type)

* `CaptureRouteResult` (type)

* `CaptureScreenshotEntry` (type)

* `CaptureResultMetadata` (type)

* `JSONObject` (interface)

* `JSONSchema` (type)

* `_JSONSchema` (type)

* `JSONType` (type)

* `JSONArray` (type)

* `NonNullJSONType` (type)

* `SerializableType` (type) — Values serializable to JSON; \`Date\` is allowed and will be converted to ISO string by \`JSON.stringify\`.
  Safer than \`unknown\` — functions, symbols, and other non-serializable types are rejected.

* `MemoryRecallBm25CompressionProfile` (type)

* `MemoryRecallBm25CapabilityEntry` (type)

* `MemoryRecallBm25CapabilityQuery` (type)

* `MemoryRecallBm25CapabilityDirectory` (type)

* `FileMeta` (type)

* `TranslatableElementData` (type)

* `ElementTranslationStatus` (type)

* `MemorySuggestion` (type)

* `AdaptationMethod` (type)

* `TranslationSuggestionStatus` (type)

* `UnvectorizedTextData` (type)

* `VectorizedTextData` (type)

* `TermData` (type)

* `AuthMethod` (type)

* `TranslationAdvisorData` (type)

* `NlpToken` (type)

* `NlpSentence` (type)

* `NlpSegmentResult` (type)

* `NlpBatchSegmentResult` (type)

* `PermissionCheck` (type)

* `GrantPermission` (type)

* `TranslationAdvise` (type)

* `PluginManifest` (type)

* `PluginData` (type)

* `TranslationSuggestion` (type)

* `EvidenceLane` (type)

* `QueryProfile` (type)

* `BudgetClass` (type)

* `ScopeEnvelope` (type)

* `TopicMatchState` (type)

* `CandidateTopicAssignment` (type)

* `MemoryTopicBinding` (type)

* `QueryTopicConfidence` (type)

* `QueryTopicHypothesis` (type)

* `AnchorSignature` (type)

* `RankingDecision` (type)

* `AmbiguityEnvelope` (type)

* `ProviderStatus` (type)

* `ProjectSettingPayload` (type)

* `QaReviewTextRange` (type)

* `QaReviewSpan` (type)

* `QaReviewRule` (type)

* `QaReviewProfileConfig` (type)

* `NormalizedQaFinding` (type)

* `QaReviewNotificationData` (type)

* `QaReviewQueueFilters` (type)

* `SubmitQaReviewDecisionInput` (type)

* `QaReviewWorkbenchAction` (type) — Action types for the QA review workbench.

* `SubmitQaReviewActionInput` (type) — Input payload for submitting a QA workbench action.

* `QaReviewActionResult` (type) — Result payload for a QA workbench action.

* `CreateQaReviewAnnotationInput` (type)

* `CreateQaReviewSuggestionInput` (type)

* `ApplyQaReviewSuggestionInput` (type)

* `QaReviewRunMeta` (type)

* `RecallChannel` (type)

* `RecallEvidence` (type)

* `RecallDebugContext` (type)

* `RerankProviderCall` (type)

* `RerankRequest` (type)

* `RerankResponse` (type)

* `RerankDecisionTrace` (type)

* `RerankCandidateItem` (type) — Rerank candidate-item type.

* `RerankBand` (type)

* `TermMatch` (type)

* `ConceptContext` (type)

* `EnrichedTermMatch` (type)

* `setCookie` (type)

* `delCookie` (type)

* `getCookie` (type)

* `getQueryParam` (type)

* `getReqHeader` (type)

* `setResHeader` (type)

* `HTTPHelpers` (type)

* `LogEntry` (interface)

* `LoggerTransport` (interface)

* `LogLevel` (type)

* `OutputSituation` (type)
