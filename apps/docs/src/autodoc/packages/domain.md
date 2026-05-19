# @cat/domain

Domain layer: CQRS Commands and Queries, core business logic

## Overview

* **Modules**: 349

* **Exported functions**: 377

* **Exported types**: 482

## Function Index

### packages/domain/src

### `executeCommand`

```ts
export const executeCommand = async (execCtx: ExecutorContext, command: Command<C, R>, input: C): Promise<R>
```

### `executeQuery`

```ts
export const executeQuery = async (execCtx: Pick<ExecutorContext, "db">, query: Query<Q, R>, input: Q): Promise<R>
```

### packages/domain/src/cache

### `generateCacheKey`

```ts
/**
 * 生成输入数据的哈希值作为缓存键
 */
export const generateCacheKey = (payload: unknown): string
```

### `initCacheStore`

```ts
/**
 * 初始化缓存存储
 */
export const initCacheStore = (store: CacheStore)
```

### `getCacheStore`

```ts
/**
 * 获取缓存存储实例
 */
export const getCacheStore = (): CacheStore
```

### `initSessionStore`

```ts
/**
 * 初始化会话存储
 */
export const initSessionStore = (store: SessionStore)
```

### `getSessionStore`

```ts
/**
 * 获取会话存储实例
 */
export const getSessionStore = (): SessionStore
```

### `withCache`

```ts
/**
 * 带缓存的高阶函数包装器
 * 包装一个异步函数，使其自动使用缓存
 */
export const withCache = (operation: (input: I) => Promise<O>, options: CacheOptions): (input: I) => Promise<O>
```

### packages/domain/src/capabilities

### `createPluginCapabilities`

```ts
export const createPluginCapabilities = (execCtx: ExecutorContext, checkPermission?: CheckPermissionFn): PluginCapabilities
```

### packages/domain/src/commands/agent

### `completeAgentSession`

```ts
/**
 * Mark an AgentSession as a terminal state (COMPLETED / FAILED / CANCELLED).
 */
export const completeAgentSession: Command<
  CompleteAgentSessionCommand
> = async (ctx: DbContext, command: { sessionId: string; finalStatus: "COMPLETED" | "FAILED" | "CANCELLED"; }) => {...}
```

### `createAgentDefinition`

```ts
export const createAgentDefinition: Command<
  CreateAgentDefinitionCommand,
  { id: string }
> = async (ctx: DbContext, command: { name: string; description: string; scopeType: "GLOBAL" | "PROJECT" | "USER"; scopeId: string; definitionId: string; version: string; type: "GENERAL" | "GHOST_TEXT" | "WORKFLOW"; tools: string[]; content: string; isBuiltin: boolean; icon?: string | undefined; llmConfig?: { providerId?: number | null | undefined; temperature?: number | undefined; maxTokens?: number | undefined; } | undefined; promptConfig?: { autoInjectSlots: number[]; } | undefined; constraints?: { maxSteps: number; maxConcurrentToolCalls: number; timeoutMs: number; maxCorrectionAttempts: number; errorRecovery?: { truncationMax: number; contextOverflowMax: number; } | undefined; } | undefined; securityPolicy?: { allowExternalNetwork: boolean; } | undefined; orchestration?: { mode: "pipeline"; stages: { agentId: string; outputKey: string; inputFrom?: string | string[] | undefined; }[]; } | null | undefined; }) => {...}
```

### `createAgentRun`

```ts
/**
 * Create a new AgentRun and update AgentSession.currentRunId.
 */
export const createAgentRun: Command<
  CreateAgentRunCommand,
  CreateAgentRunResult
> = async (ctx: DbContext, command: { sessionId: string; graphDefinition: any; deduplicationKey?: string | undefined; }) => {...}
```

### `createAgentSession`

```ts
export const createAgentSession: Command<
  CreateAgentSessionCommand,
  { sessionId: string }
> = async (ctx: DbContext, command: { agentDefinitionId: string; userId: string; projectId?: string | undefined; metadata?: { projectId?: string | undefined; projectName?: string | undefined; providerId?: number | undefined; branchId?: number | undefined; contentNodeIds?: string[] | undefined; currentElementContentNodeId?: string | undefined; elementId?: number | undefined; languageId?: string | undefined; sourceLanguageId?: string | undefined; issueId?: number | undefined; pullRequestId?: number | undefined; } | undefined; }) => {...}
```

### `deleteAgentDefinition`

```ts
export const deleteAgentDefinition: Command<
  DeleteAgentDefinitionCommand
> = async (ctx: DbContext, command: { agentDefinitionId: number; }) => {...}
```

### `finishAgentRun`

```ts
/**
 * Update AgentRun status to a terminal state and record completion time.
 */
export const finishAgentRun: Command<FinishAgentRunCommand> = async (ctx: DbContext, command: { runId: string; status: "completed" | "failed" | "cancelled"; }) => {...}
```

### `saveAgentEvent`

```ts
export const saveAgentEvent: Command<SaveAgentEventCommand> = async (ctx: DbContext, command: { runInternalId: number; eventId: string; parentEventId: string | null; nodeId: string | null; type: string; payload: any; timestamp: Date; }) => {...}
```

### `saveAgentExternalOutput`

```ts
export const saveAgentExternalOutput: Command<
  SaveAgentExternalOutputCommand
> = async (ctx: DbContext, command: { runInternalId: number; nodeId: string; outputType: string; outputKey: string; payload: any; idempotencyKey: string | null; createdAt: Date; }) => {...}
```

### `saveAgentRunMetadata`

```ts
export const saveAgentRunMetadata: Command<
  SaveAgentRunMetadataCommand
> = async (ctx: DbContext, command: { externalId: string; sessionId: number; status: string; graphDefinition: any; currentNodeId: string | null; deduplicationKey: string | null; startedAt: Date; completedAt: Date | null; metadata: any; }) => {...}
```

### `saveAgentRunSnapshot`

```ts
export const saveAgentRunSnapshot: Command<
  SaveAgentRunSnapshotCommand
> = async (ctx: DbContext, command: { externalId: string; snapshot: any; }) => {...}
```

### `updateAgentDefinition`

```ts
export const updateAgentDefinition: Command<
  UpdateAgentDefinitionCommand
> = async (ctx: DbContext, command: { id: string; name?: string | undefined; description?: string | undefined; definitionId?: string | undefined; version?: string | undefined; icon?: string | null | undefined; type?: "GENERAL" | "GHOST_TEXT" | "WORKFLOW" | undefined; llmConfig?: { providerId?: number | null | undefined; temperature?: number | undefined; maxTokens?: number | undefined; } | null | undefined; tools?: string[] | undefined; promptConfig?: { autoInjectSlots: number[]; } | null | undefined; constraints?: { maxSteps: number; maxConcurrentToolCalls: number; timeoutMs: number; maxCorrectionAttempts: number; errorRecovery?: { truncationMax: number; contextOverflowMax: number; } | undefined; } | null | undefined; securityPolicy?: { allowExternalNetwork: boolean; } | null | undefined; orchestration?: { mode: "pipeline"; stages: { agentId: string; outputKey: string; inputFrom?: string | string[] | undefined; }[]; } | null | undefined; content?: string | undefined; }) => {...}
```

### packages/domain/src/commands/api-key

### `createApiKey`

```ts
export const createApiKey: Command<
  CreateApiKeyCommand,
  { id: number }
> = async (ctx: DbContext, command: CreateApiKeyCommand) => {...}
```

### `revokeApiKey`

```ts
export const revokeApiKey: Command<RevokeApiKeyCommand> = async (ctx: DbContext, command: RevokeApiKeyCommand) => {...}
```

### `updateApiKeyLastUsed`

```ts
export const updateApiKeyLastUsed: Command<
  UpdateApiKeyLastUsedCommand
> = async (ctx: DbContext, command: UpdateApiKeyLastUsedCommand) => {...}
```

### packages/domain/src/commands/auth

### `createAccount`

```ts
export const createAccount: Command<
  CreateAccountCommand,
  CreateAccountResult
> = async (ctx: DbContext, command: { userId: string; authProviderId: number; providerIssuer: string; providedAccountId: string; accountMeta?: any; }) => {...}
```

### `createMfaProvider`

```ts
export const createMfaProvider: Command<
  CreateMfaProviderCommand,
  typeof mfaProvider.$inferSelect
> = async (ctx: DbContext, command: { userId: string; mfaServiceId: number; payload: any; }) => {...}
```

### `registerUserWithPasswordAccount`

```ts
export const registerUserWithPasswordAccount: Command<
  RegisterUserWithPasswordAccountCommand,
  RegisterUserWithPasswordAccountResult
> = async (ctx: DbContext, command: { email: string; name: string; password: string; authProviderId: number; }) => {...}
```

### packages/domain/src/commands/branch

### `createBranch`

```ts
/**
 * Creates a new entity_branch with baseChangesetId set to the latest main changeset ID.
 */
export const createBranch: Command<
  CreateBranchCommand,
  typeof entityBranch.$inferSelect
> = async (ctx: DbContext, command: { projectId: string; name: string; createdBy?: string | undefined; createdByAgentId?: number | undefined; }) => {...}
```

### `markBranchConflicted`

```ts
export const markBranchConflicted: Command<
  MarkBranchConflictedCommand,
  typeof entityBranch.$inferSelect
> = async (ctx: DbContext, command: { branchId: number; hasConflicts: boolean; }) => {...}
```

### `updateBranchBaseChangeset`

```ts
export const updateBranchBaseChangeset: Command<
  UpdateBranchBaseChangesetCommand,
  typeof entityBranch.$inferSelect
> = async (ctx: DbContext, command: { branchId: number; baseChangesetId: number | null; }) => {...}
```

### `updateBranchStatus`

```ts
export const updateBranchStatus: Command<
  UpdateBranchStatusCommand,
  typeof entityBranch.$inferSelect
> = async (ctx: DbContext, command: { branchId: number; status: "MERGED" | "ACTIVE" | "ABANDONED"; mergedAt?: Date | undefined; }) => {...}
```

### packages/domain/src/commands/changeset

### `addChangesetEntry`

```ts
export const addChangesetEntry: Command<
  AddChangesetEntryCommand,
  typeof changesetEntry.$inferSelect
> = async (ctx: DbContext, command: { changesetId: number; entityType: "project" | "content_node" | "content_relation" | "context_evidence" | "context_profile" | "element" | "term" | "translation" | "comment" | "auto_translation" | "content_relation_type" | "scope_binding" | "semantic_diff" | "comment_reaction" | "term_concept" | "memory_item" | "project_settings" | "project_member" | "project_attributes" | "issue"; entityId: string; action: "CREATE" | "UPDATE" | "DELETE"; riskLevel: "LOW" | "MEDIUM" | "HIGH"; before?: any; after?: any; fieldPath?: string | undefined; asyncStatus?: "FAILED" | "PENDING" | "READY" | null | undefined; asyncTaskIds?: string[] | undefined; }) => {...}
```

### `batchUpdateEntryBefore`

```ts
/**
 * Batch-update the `before` field of changeset entries. Used exclusively for rebase before-rewrite.
 */
export const batchUpdateEntryBefore: Command<
  BatchUpdateEntryBeforeCommand
> = async (ctx: DbContext, command: { updates: { entryId: number; before: unknown; }[]; }) => {...}
```

### `createChangeset`

```ts
export const createChangeset: Command<
  CreateChangesetCommand,
  typeof changeset.$inferSelect
> = async (ctx: DbContext, command: { projectId: string; agentRunId?: number | undefined; createdBy?: string | undefined; summary?: string | undefined; branchId?: number | undefined; status?: "PENDING" | "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED" | "APPLIED" | "CONFLICT" | undefined; }) => {...}
```

### `reviewChangesetEntry`

```ts
export const reviewChangesetEntry: Command<
  ReviewChangesetEntryCommand
> = async (ctx: DbContext, command: { entryId: number; verdict: "APPROVED" | "REJECTED"; }) => {...}
```

### `reviewChangeset`

```ts
export const reviewChangeset: Command<ReviewChangesetCommand> = async (ctx: DbContext, command: { changesetId: number; verdict: "APPROVED" | "REJECTED"; reviewedBy?: string | undefined; }) => {...}
```

### `applyChangeset`

```ts
export const applyChangeset: Command<ApplyChangesetCommand> = async (ctx: DbContext, command: { changesetId: number; }) => {...}
```

### `updateEntryAsyncStatus`

```ts
export const updateEntryAsyncStatus: Command<
  UpdateEntryAsyncStatusCommand
> = async (ctx: DbContext, command: { entryId: number; asyncStatus: "FAILED" | "PENDING" | "READY"; }) => {...}
```

### `updateChangesetAsyncStatus`

```ts
export const updateChangesetAsyncStatus: Command<
  UpdateChangesetAsyncStatusCommand
> = async (ctx: DbContext, command: { changesetId: number; asyncStatus: "ALL_READY" | "HAS_PENDING" | "HAS_FAILED" | null; }) => {...}
```

### `upsertAutoTranslationEntry`

```ts
/**
 * Application-level upsert: find existing auto_translation changeset entry and
 * update it, or insert a new one.
 */
export const upsertAutoTranslationEntry: Command<
  UpsertAutoTranslationEntryCommand
> = async (ctx: DbContext, command: { changesetId: number; entityId: string; after: any; }) => {...}
```

### packages/domain/src/commands/comment

### `createComment`

```ts
export const createComment: Command<
  CreateCommentCommand,
  typeof comment.$inferSelect
> = async (ctx: DbContext, command: { targetType: "ELEMENT" | "TRANSLATION"; targetId: number; userId: string; content: string; languageId: string; parentCommentId?: number | undefined; }) => {...}
```

### `deleteCommentReaction`

```ts
export const deleteCommentReaction: Command<
  DeleteCommentReactionCommand
> = async (ctx: DbContext, command: { commentId: number; userId: string; }) => {...}
```

### `deleteComment`

```ts
export const deleteComment: Command<DeleteCommentCommand> = async (ctx: DbContext, command: { commentId: number; userId: string; }) => {...}
```

### `upsertCommentReaction`

```ts
export const upsertCommentReaction: Command<
  UpsertCommentReactionCommand,
  typeof commentReaction.$inferSelect
> = async (ctx: DbContext, command: { commentId: number; userId: string; type: "+1" | "-1" | "LAUGH" | "HOORAY" | "CONFUSED" | "HEART" | "ROCKET" | "EYES"; }) => {...}
```

### packages/domain/src/commands/content

### `applyContentGraphEnvelope`

```ts
/**
 * Persist relation types and nodes for a structured content graph payload.
 *
 * Merges CoreRelationTypeDefinitions with payload.relationTypes and upserts
 * all relation types by (namespace, name, version). Upserts nodes by
 * (projectId, importerId, sourceRootRef, stableSourceNodeRef). Returns
 * node ref maps for subsequent diffing.
 */
export const applyContentGraphEnvelope: Command<
  ApplyContentGraphEnvelopeInput,
  AppliedGraphEnvelope
> = async (ctx: DbContext, command: ApplyContentGraphEnvelopeInput) => {...}
```

### `bulkUpdatePrimaryRelationOrder`

```ts
export const bulkUpdatePrimaryRelationOrder: Command<
  BulkUpdatePrimaryRelationOrderCommand
> = async (ctx: DbContext, command: { primaryContentNodeId: string; data: { elementId: number; localOrder: number; }[]; }) => {...}
```

### `createContentNodeUnderParent`

```ts
export const createContentNodeUnderParent: Command<
  CreateContentNodeUnderParentCommand,
  typeof contentNode.$inferSelect
> = async (ctx: DbContext, command: { projectId: string; parentContentNodeId: string; kind: "FILE" | "DIRECTORY" | "MARKDOWN_SECTION" | "SOURCE_COMPONENT" | "CUSTOM"; displayLabel: string; importerId: string; sourceRootRef: string; stableSourceNodeRef: string; exportRole: "FILE" | "DIRECTORY" | "NONE" | "SECTION"; boundaryType: "FILE" | "DIRECTORY" | "MODULE" | "NONE" | "SOURCE_ROOT"; localOrder: number; creatorId?: string | undefined; sourceUri?: string | null | undefined; sourcePath?: string | null | undefined; sourceType?: string | null | undefined; languageId?: string | null | undefined; fileHandlerId?: number | null | undefined; fileId?: number | null | undefined; }) => {...}
```

### `createRootContentNode`

```ts
export const createRootContentNode: Command<
  CreateRootContentNodeCommand,
  typeof contentNode.$inferSelect
> = async (ctx: DbContext, command: { projectId: string; creatorId: string; }) => {...}
```

### `deleteContentNode`

```ts
/**
 * Delete a content node (cascading to its relations and children).
 */
export const deleteContentNode: Command<DeleteContentNodeCommand> = async (ctx: DbContext, command: { contentNodeId: string; }) => {...}
```

### `ensureCoreRelationTypes`

```ts
export const ensureCoreRelationTypes: Command<
  EnsureCoreRelationTypesCommand,
  Record<string, number>
> = async (ctx: DbContext) => {...}
```

### `insertSemanticDiffEntry`

```ts
/**
 * Insert a single semantic diff entry record.
 */
export const insertSemanticDiffEntry: Command<
  InsertSemanticDiffEntryInput,
  InsertSemanticDiffEntryOutput
> = async (ctx: DbContext, command: InsertSemanticDiffEntryInput) => {...}
```

### `persistContentGraphAttachments`

```ts
/**
 * Persist relations and context evidence from a structured content graph payload.
 *
 * After element diff creates/updates elements, resolves payload.relations
 * and payload.evidence endpoint refs to database IDs and persists them.
 */
export const persistContentGraphAttachments: Command<
  PersistContentGraphAttachmentsInput,
  PersistContentGraphAttachmentsOutput
> = async (ctx: DbContext, command: PersistContentGraphAttachmentsInput) => {...}
```

### `updatePrimaryElementRelationsForDiff`

```ts
/**
 * Update primary containment relations for stable-identity diffs.
 */
export const updatePrimaryElementRelationsForDiff: Command<
  UpdatePrimaryElementRelationsForDiffCommand
> = async (ctx: DbContext, command: { updates: { elementId: number; primaryContentNodeId: string; localOrder: number | null; }[]; }) => {...}
```

### packages/domain/src/commands/context

### `addElementContextEvidence`

```ts
/**
 * Add context evidence rows for elements in bulk.
 */
export const addElementContextEvidence: Command<
  AddElementContextEvidenceCommandInput,
  { addedCount: number }
> = async (ctx: DbContext, command: { projectId: string; evidence: { elementId: number; kind: "TEXT" | "JSON" | "FILE" | "MARKDOWN" | "URL" | "IMAGE" | "COMMENT" | "SOURCE_LOCATION" | "SCREENSHOT" | "GENERATED_ANALYSIS" | "EXTERNAL_REFERENCE"; fileId?: number | null | undefined; storageProviderId?: number | null | undefined; textData?: string | null | undefined; jsonData?: any; displayLabel?: string | null | undefined; trustLevel?: "UNTRUSTED" | "COLLECTED" | "VERIFIED" | "REVIEW_APPROVED" | undefined; provenance?: any; }[]; }) => {...}
```

### `ensureDefaultContextProfile`

```ts
export const ensureDefaultContextProfile: Command<
  EnsureDefaultContextProfileCommand,
  typeof contextProfile.$inferSelect
> = async (ctx: DbContext, command: { projectId: string; }) => {...}
```

### packages/domain/src/commands/cross-reference

### `parseAndSaveCrossReferences`

```ts
/**
 * Parses #N references in text and saves them to the cross_reference table.
 * On edit: deletes old references for this source, then inserts fresh ones.
 */
export const parseAndSaveCrossReferences: Command<
  ParseAndSaveCrossReferencesCommand
> = async (ctx: DbContext, command: { projectId: string; sourceType: "issue" | "pr" | "issue_comment"; sourceId: number; text: string; }) => {...}
```

### packages/domain/src/commands/element

### `bulkUpdateElementsForDiff`

```ts
export const bulkUpdateElementsForDiff: Command<
  BulkUpdateElementsForDiffCommandInput
> = async (ctx: DbContext, command: { stringIdUpdates?: { id: number; stringId: number; }[] | undefined; locationUpdates?: { id: number; sourceStartLine: number | null; sourceEndLine: number | null; sourceLocationMeta: z.core.util.JSONType; }[] | undefined; }) => {...}
```

### `createElements`

```ts
export const createElements: Command<CreateElementsCommand, number[]> = async (ctx: DbContext, command: { data: { projectId: string; primaryContentNodeId: string; importerId: string; sourceRootRef: string; sourceNodeRef: string; stableSourceRef: string; stringId: number; meta?: z.core.util.JSONType | undefined; creatorId?: string | undefined; localOrder?: number | undefined; sourceStartLine?: number | null | undefined; sourceEndLine?: number | null | undefined; sourceLocationMeta?: z.core.util.JSONType | undefined; }[]; }) => {...}
```

### `deleteElementsByIds`

```ts
export const deleteElementsByIds: Command<DeleteElementsByIdsCommand> = async (ctx: DbContext, command: { elementIds: number[]; }) => {...}
```

### packages/domain/src/commands/file

### `createBlob`

```ts
export const createBlob: Command<
  CreateBlobCommand,
  typeof blob.$inferSelect
> = async (ctx: DbContext, command: { key: string; storageProviderId: number; hash?: Buffer<ArrayBufferLike> | undefined; }) => {...}
```

### `createFile`

```ts
export const createFile: Command<
  CreateFileCommand,
  typeof file.$inferSelect
> = async (ctx: DbContext, command: { name: string; blobId: number; isActive?: boolean | undefined; }) => {...}
```

### `createOrReferenceBlobAndFile`

```ts
export const createOrReferenceBlobAndFile: Command<
  CreateOrReferenceBlobAndFileCommand,
  CreateOrReferenceBlobAndFileResult
> = async (ctx: DbContext, command: { key: string; storageProviderId: number; name: string; hash: Buffer<ArrayBufferLike>; }) => {...}
```

### `createBlobAndFile`

```ts
export const createBlobAndFile: Command<
  CreateBlobAndFileCommand,
  CreateBlobAndFileResult
> = async (ctx: DbContext, command: { key: string; storageProviderId: number; name: string; }) => {...}
```

### `activateFile`

```ts
export const activateFile: Command<ActivateFileCommand> = async (ctx: DbContext, command: { fileId: number; }) => {...}
```

### `rollbackBlobAndFile`

```ts
export const rollbackBlobAndFile: Command<RollbackBlobAndFileCommand> = async (ctx: DbContext, command: { blobId: number; fileId: number; }) => {...}
```

### `deleteBlobAndFile`

```ts
export const deleteBlobAndFile: Command<DeleteBlobAndFileCommand> = async (ctx: DbContext, command: { blobId: number; fileId: number; }) => {...}
```

### `finalizePresignedFile`

```ts
export const finalizePresignedFile: Command<
  FinalizePresignedFileCommand,
  FinalizePresignedFileResult
> = async (ctx: DbContext, command: { blobId: number; fileId: number; hash: Buffer<ArrayBufferLike>; }) => {...}
```

### packages/domain/src/commands/glossary

### `addGlossaryTermToConcept`

```ts
export const addGlossaryTermToConcept: Command<
  AddGlossaryTermToConceptCommand,
  AddGlossaryTermToConceptResult
> = async (ctx: DbContext, command: { conceptId: number; text: string; languageId: string; type: "NOT_SPECIFIED" | "FULL_FORM" | "ACRONYM" | "ABBREVIATION" | "SHORT_FORM" | "VARIANT" | "PHRASE"; status: "NOT_SPECIFIED" | "PREFERRED" | "ADMITTED" | "NOT_RECOMMENDED" | "OBSOLETE"; creatorId?: string | undefined; }) => {...}
```

### `createGlossaryConceptSubject`

```ts
export const createGlossaryConceptSubject: Command<
  CreateGlossaryConceptSubjectCommand,
  { id: number }
> = async (ctx: DbContext, command: { glossaryId: string; subject: string; defaultDefinition?: string | undefined; }) => {...}
```

### `createGlossaryConcept`

```ts
export const createGlossaryConcept: Command<
  CreateGlossaryConceptCommand,
  { id: number }
> = async (ctx: DbContext, command: { glossaryId: string; definition: string; subjectIds?: number[] | undefined; }) => {...}
```

### `createGlossaryTerms`

```ts
export const createGlossaryTerms: Command<
  CreateGlossaryTermsCommand,
  CreateGlossaryTermsResult
> = async (ctx: DbContext, command: { glossaryId: string; data: { term: string; termLanguageId: string; translation: string; translationLanguageId: string; definition?: string | null | undefined; subjectIds?: number[] | null | undefined; conceptId?: number | null | undefined; glossaryId?: string | null | undefined; }[]; creatorId?: string | undefined; }) => {...}
```

### `createGlossary`

```ts
export const createGlossary: Command<
  CreateGlossaryCommand,
  typeof glossary.$inferSelect
> = async (ctx: DbContext, command: { name: string; creatorId: string; description?: string | undefined; projectIds?: string[] | undefined; }) => {...}
```

### `deleteGlossaryTerm`

```ts
export const deleteGlossaryTerm: Command<
  DeleteGlossaryTermCommand,
  DeleteGlossaryTermResult
> = async (ctx: DbContext, command: { termId: number; }) => {...}
```

### `replaceTermRecallVariants`

```ts
/**
 * Idempotent replace: delete all existing variants for (conceptId, languageId)
 * and insert the new set in a single transaction.
 *
 * Designed to be called after term content changes. Passing an empty
 * `variants` array is a valid "clear" operation.
 */
export const replaceTermRecallVariants: Command<
  ReplaceTermRecallVariantsCommand
> = async (ctx: DbContext, command: { conceptId: number; languageId: string; variants: { text: string; normalizedText: string; variantType: "SURFACE" | "CASE_FOLDED" | "LEMMA" | "TOKEN_TEMPLATE" | "FRAGMENT"; meta?: z.core.util.JSONType | undefined; }[]; }) => {...}
```

### `setConceptStringId`

```ts
export const setConceptStringId: Command<
  SetConceptStringIdCommand,
  SetConceptStringIdResult
> = async (ctx: DbContext, command: { conceptId: number; stringId: number | null; }) => {...}
```

### `updateGlossaryConcept`

```ts
export const updateGlossaryConcept: Command<
  UpdateGlossaryConceptCommand,
  UpdateGlossaryConceptResult
> = async (ctx: DbContext, command: { conceptId: number; subjectIds?: number[] | undefined; definition?: string | undefined; }) => {...}
```

### packages/domain/src/commands/issue

### `assignIssue`

```ts
export const assignIssue: Command<
  AssignIssueCommand,
  typeof issue.$inferSelect
> = async (ctx: DbContext, command: { issueId: number; assignees: { type: "user" | "agent"; id: string; }[]; }) => {...}
```

### `claimIssue`

```ts
/**
 * Atomically claims the first OPEN issue matching claimPolicy in the project (FOR UPDATE SKIP LOCKED).
 *
 * Returns null if no claimable issue is available.
 */
export const claimIssue: Command<ClaimIssueCommand, ClaimIssueResult> = async (ctx: DbContext, command: { projectId: string; userId?: string | undefined; agentId?: number | undefined; }) => {...}
```

### `closeIssue`

```ts
export const closeIssue: Command<
  CloseIssueCommand,
  typeof issue.$inferSelect
> = async (ctx: DbContext, command: { issueId: number; closedByPRId?: number | undefined; }) => {...}
```

### `createIssue`

```ts
export const createIssue: Command<
  CreateIssueCommand,
  typeof issue.$inferSelect
> = async (ctx: DbContext, command: { projectId: string; title: string; body: string; assignees: { type: "user" | "agent"; id: string; }[]; labels: string[]; authorId?: string | undefined; authorAgentId?: number | undefined; claimPolicy?: { rules: { type: "user" | "role" | "agent"; id: string; }[]; } | null | undefined; parentIssueId?: number | undefined; metadata?: any; }) => {...}
```

### `reopenIssue`

```ts
export const reopenIssue: Command<
  ReopenIssueCommand,
  typeof issue.$inferSelect
> = async (ctx: DbContext, command: { issueId: number; }) => {...}
```

### `updateIssue`

```ts
export const updateIssue: Command<
  UpdateIssueCommand,
  typeof issue.$inferSelect
> = async (ctx: DbContext, command: { issueId: number; title?: string | undefined; body?: string | undefined; labels?: string[] | undefined; metadata?: any; }) => {...}
```

### packages/domain/src/commands/issue-comment

### `createIssueComment`

```ts
export const createIssueComment: Command<
  CreateIssueCommentCommand,
  typeof issueComment.$inferSelect
> = async (ctx: DbContext, command: { threadId: number; body: string; targetType: "issue" | "pr"; targetId: number; authorId?: string | undefined; authorAgentId?: number | undefined; }) => {...}
```

### `createThread`

```ts
export const createThread: Command<
  CreateThreadCommand,
  typeof issueCommentThread.$inferSelect
> = async (ctx: DbContext, command: { targetType: "issue" | "pr"; targetId: number; isReviewThread: boolean; reviewContext?: { entityType: string; entityId: string; fieldPath: string; changesetEntryId: number; } | null | undefined; }) => {...}
```

### `deleteIssueComment`

```ts
export const deleteIssueComment: Command<DeleteIssueCommentCommand> = async (ctx: DbContext, command: { commentId: number; }) => {...}
```

### `resolveThread`

```ts
export const resolveThread: Command<
  ResolveThreadCommand,
  typeof issueCommentThread.$inferSelect
> = async (ctx: DbContext, command: { threadId: number; resolved: boolean; }) => {...}
```

### `updateIssueComment`

```ts
export const updateIssueComment: Command<
  UpdateIssueCommentCommand,
  typeof issueComment.$inferSelect
> = async (ctx: DbContext, command: { commentId: number; body: string; }) => {...}
```

### packages/domain/src/commands/language

### `ensureLanguages`

```ts
export const ensureLanguages: Command<EnsureLanguagesCommand> = async (ctx: DbContext, command: { languageIds: string[]; }) => {...}
```

### packages/domain/src/commands/login-attempt

### `insertLoginAttempt`

```ts
export const insertLoginAttempt: Command<InsertLoginAttemptCommand> = async (ctx: DbContext, command: InsertLoginAttemptCommand) => {...}
```

### packages/domain/src/commands/memory

### `createMemoryItems`

```ts
export const createMemoryItems: Command<
  CreateMemoryItemsCommand,
  CreatedMemoryItemRow[]
> = async (ctx: DbContext, command: { memoryId: string; items: { translationId: number | null; translationStringId: number; sourceStringId: number; creatorId: string | null; sourceTemplate: string | null; translationTemplate: string | null; slotMapping: any; }[]; }) => {...}
```

### `createMemory`

```ts
export const createMemory: Command<
  CreateMemoryCommand,
  typeof memory.$inferSelect
> = async (ctx: DbContext, command: { name: string; creatorId: string; description?: string | undefined; projectIds?: string[] | undefined; }) => {...}
```

### `replaceMemoryRecallVariants`

```ts
/**
 * Idempotent replace: delete all existing variants for
 * (memoryItemId, languageId, querySide) and insert the new set.
 */
export const replaceMemoryRecallVariants: Command<
  ReplaceMemoryRecallVariantsCommand
> = async (ctx: DbContext, command: { memoryItemId: number; memoryId: string; languageId: string; querySide: "TRANSLATION" | "SOURCE"; variants: { text: string; normalizedText: string; variantType: "SURFACE" | "CASE_FOLDED" | "LEMMA" | "TOKEN_TEMPLATE" | "FRAGMENT"; meta?: z.core.util.JSONType | undefined; }[]; }) => {...}
```

### packages/domain/src/commands/notification

### `createNotification`

```ts
/**
 * Create an in-app notification record and publish notification:created event.
 */
export const createNotification: Command<
  CreateNotificationCommand,
  typeof notification.$inferSelect
> = async (ctx: DbContext, cmd: { recipientId: string; category: "PROJECT" | "TRANSLATION" | "SYSTEM" | "COMMENT_REPLY" | "QA"; title: string; body: string; data?: JSONType | undefined; }) => {...}
```

### `markAllNotificationsRead`

```ts
/**
 * Mark all notifications as read.
 */
export const markAllNotificationsRead: Command<
  MarkAllNotificationsReadCommand
> = async (ctx: DbContext, cmd: { userId: string; }) => {...}
```

### `markNotificationRead`

```ts
/**
 * Mark notification read.
 */
export const markNotificationRead: Command<
  MarkNotificationReadCommand
> = async (ctx: DbContext, cmd: { notificationId: number; userId: string; }) => {...}
```

### `upsertMessagePreference`

```ts
/**
 * Update user message preference (upsert).
 */
export const upsertMessagePreference: Command<
  UpsertMessagePreferenceCommand
> = async (ctx: DbContext, cmd: { userId: string; category: "PROJECT" | "TRANSLATION" | "SYSTEM" | "COMMENT_REPLY" | "QA"; channel: "IN_APP" | "EMAIL"; enabled: boolean; }) => {...}
```

### packages/domain/src/commands/permission

### `grantFirstUserSuperadmin`

```ts
/**
 * 检查是否为首位注册用户：若是，自动授予 system#superadmin 权限元组，
 * 并将 setting "system:first_user_registered" 置为 true。
 *
 * 性能优化：只查一次 setting（O(1)），不走 count(*)。
 * 幂等：若 setting 已存在则直接返回。
 */
export const grantFirstUserSuperadmin: Command<
  GrantFirstUserSuperadminCommand
> = async (ctx: DbContext, command: { userId: string; }) => {...}
```

### `grantPermissionTuple`

```ts
/**
 * 插入权限关系元组，已存在则忽略（幂等）。
 * 联写规则：当 objectType=project 且 relation ∈ {editor,admin,owner} 时，
 * 同一事务内额外 grant `direct_editor`（幂等）。
 */
export const grantPermissionTuple: Command<
  GrantPermissionTupleCommand
> = async (ctx: DbContext, command: { subjectType: "user" | "role" | "agent"; subjectId: string; relation: "superadmin" | "admin" | "owner" | "editor" | "viewer" | "member" | "direct_editor" | "isolation_forced"; objectType: "system" | "project" | "content_node" | "content_relation" | "context_evidence" | "context_profile" | "element" | "glossary" | "memory" | "term" | "translation" | "comment" | "plugin" | "setting" | "task" | "agent_definition" | "user"; objectId: string; }) => {...}
```

### `insertAuditLogs`

```ts
/**
 * 批量插入鉴权审计日志。写入失败时静默忽略，不影响业务流程。
 */
export const insertAuditLogs: Command<InsertAuditLogsCommand> = async (ctx: DbContext, command: { entries: { subjectType: "user" | "role" | "agent"; subjectId: string; action: "check" | "grant" | "revoke"; relation: "superadmin" | "admin" | "owner" | "editor" | "viewer" | "member" | "direct_editor" | "isolation_forced"; objectType: "system" | "project" | "content_node" | "content_relation" | "context_evidence" | "context_profile" | "element" | "glossary" | "memory" | "term" | "translation" | "comment" | "plugin" | "setting" | "task" | "agent_definition" | "user"; objectId: string; result: boolean; traceId?: string | undefined; ip?: string | undefined; userAgent?: string | undefined; }[]; }) => {...}
```

### `revokePermissionTuple`

```ts
/**
 * 删除权限关系元组。元组不存在时静默完成（幂等）。
 * 联动规则：当 objectType=project 且 relation ∈ {editor,admin,owner} 时，
 * 移除当前元组后，若 Subject 对该 project 已无任何 editor+ 来源，
 * 则联动 revoke `direct_editor` 和 `isolation_forced`。
 */
export const revokePermissionTuple: Command<
  RevokePermissionTupleCommand
> = async (ctx: DbContext, command: { subjectType: "user" | "role" | "agent"; subjectId: string; relation: "superadmin" | "admin" | "owner" | "editor" | "viewer" | "member" | "direct_editor" | "isolation_forced"; objectType: "system" | "project" | "content_node" | "content_relation" | "context_evidence" | "context_profile" | "element" | "glossary" | "memory" | "term" | "translation" | "comment" | "plugin" | "setting" | "task" | "agent_definition" | "user"; objectId: string; }) => {...}
```

### `seedSystemRoles`

```ts
/**
 * 幂等地确保 4 个系统角色存在于数据库中。
 * 使用 INSERT ... ON CONFLICT DO NOTHING。
 */
export const seedSystemRoles: Command<SeedSystemRolesCommand> = async (ctx: DbContext, _command: Record) => {...}
```

### packages/domain/src/commands/plugin

### `deletePluginServices`

```ts
export const deletePluginServices: Command<
  DeletePluginServicesCommand
> = async (ctx: DbContext, command: { serviceDbIds: number[]; }) => {...}
```

### `installPlugin`

```ts
export const installPlugin: Command<InstallPluginCommand> = async (ctx: DbContext, command: { pluginId: string; scopeType: "GLOBAL" | "PROJECT" | "USER"; scopeId: string; }) => {...}
```

### `registerPluginDefinition`

```ts
export const registerPluginDefinition: Command<
  RegisterPluginDefinitionCommand
> = async (ctx: DbContext, command: { pluginId: string; version: string; name: string; entry: string; overview: string; iconUrl: string | null; configSchema?: JSONSchema | undefined; }) => {...}
```

### `syncPluginServices`

```ts
export const syncPluginServices: Command<SyncPluginServicesCommand> = async (ctx: DbContext, command: { pluginInstallationId: number; services: { serviceId: string; serviceType: "AUTH_FACTOR" | "STORAGE_PROVIDER" | "FILE_IMPORTER" | "FILE_EXPORTER" | "TRANSLATION_ADVISOR" | "TEXT_VECTORIZER" | "VECTOR_STORAGE" | "QA_CHECKER" | "TOKENIZER" | "LLM_PROVIDER" | "RERANK_PROVIDER" | "AGENT_TOOL_PROVIDER" | "AGENT_CONTEXT_PROVIDER" | "NLP_WORD_SEGMENTER" | "EMAIL_PROVIDER"; }[]; }) => {...}
```

### `uninstallPlugin`

```ts
export const uninstallPlugin: Command<UninstallPluginCommand> = async (ctx: DbContext, command: { installationId: number; }) => {...}
```

### `updatePluginConfigInstanceValueIfUnchanged`

```ts
/**
 * Update a plugin config instance value only when its version is unchanged.
 *
 * @param ctx - Database context
 * @param command - Update condition and value
 *
 * @returns Updated config instance, or null on version conflict
 */
export const updatePluginConfigInstanceValueIfUnchanged: Command<
  UpdatePluginConfigInstanceValueIfUnchangedCommand,
  typeof pluginConfigInstance.$inferSelect | null
> = async (ctx: DbContext, command: { instanceId: number; value: any; expectedUpdatedAt: Date; }) => {...}
```

### `updatePluginConfigInstanceValue`

```ts
export const updatePluginConfigInstanceValue: Command<
  UpdatePluginConfigInstanceValueCommand
> = async (ctx: DbContext, command: { instanceId: number; value: any; }) => {...}
```

### `upsertPluginConfigInstance`

```ts
export const upsertPluginConfigInstance: Command<
  UpsertPluginConfigInstanceCommand,
  typeof pluginConfigInstance.$inferSelect
> = async (ctx: DbContext, command: { pluginId: string; scopeType: "GLOBAL" | "PROJECT" | "USER"; scopeId: string; creatorId: string; value: any; }) => {...}
```

### packages/domain/src/commands/project

### `addProjectTargetLanguages`

```ts
export const addProjectTargetLanguages: Command<
  AddProjectTargetLanguagesCommand
> = async (ctx: DbContext, command: { projectId: string; languageIds: string[]; }) => {...}
```

### `createProject`

```ts
export const createProject: Command<
  CreateProjectCommand,
  typeof project.$inferSelect
> = async (ctx: DbContext, command: CreateProjectCommand) => {...}
```

### `deleteProject`

```ts
export const deleteProject: Command<DeleteProjectCommand> = async (ctx: DbContext, command: { projectId: string; }) => {...}
```

### `linkProjectGlossaries`

```ts
export const linkProjectGlossaries: Command<
  LinkProjectGlossariesCommand
> = async (ctx: DbContext, command: { projectId: string; glossaryIds: string[]; }) => {...}
```

### `linkProjectMemories`

```ts
export const linkProjectMemories: Command<LinkProjectMemoriesCommand> = async (ctx: DbContext, command: { projectId: string; memoryIds: string[]; }) => {...}
```

### `unlinkProjectGlossaries`

```ts
export const unlinkProjectGlossaries: Command<
  UnlinkProjectGlossariesCommand
> = async (ctx: DbContext, command: { projectId: string; glossaryIds: string[]; }) => {...}
```

### `unlinkProjectMemories`

```ts
export const unlinkProjectMemories: Command<
  UnlinkProjectMemoriesCommand
> = async (ctx: DbContext, command: { projectId: string; memoryIds: string[]; }) => {...}
```

### `updateProjectFeatures`

```ts
/**
 * Update project feature flags. When pullRequests toggles from true to false,
 * first checks for active PRs (rejects if any exist), then revokes all isolation_forced tuples in the same transaction.
 */
export const updateProjectFeatures: Command<
  UpdateProjectFeaturesCommand,
  typeof project.$inferSelect
> = async (ctx: DbContext, command: { projectId: string; features: { issues: boolean; pullRequests: boolean; }; }) => {...}
```

### `updateProject`

```ts
export const updateProject: Command<
  UpdateProjectCommand,
  typeof project.$inferSelect
> = async (ctx: DbContext, command: { projectId: string; name?: string | undefined; description?: string | undefined; }) => {...}
```

### packages/domain/src/commands/project-setting

### `updateProjectSettings`

```ts
export const updateProjectSettings: Command<
  UpdateProjectSettingsCommand,
  ProjectSettingPayload
> = async (ctx: DbContext, command: { projectId: string; patch: { enableAutoTranslation?: boolean | undefined; autoTranslationLanguages?: string[] | undefined; }; }) => {...}
```

### packages/domain/src/commands/pull-request

### `closePR`

```ts
/**
 * Close a PR: set PR status to CLOSED and update associated branch to ABANDONED.
 */
export const closePR: Command<
  ClosePRCommand,
  typeof pullRequest.$inferSelect
> = async (ctx: DbContext, command: { prId: number; }) => {...}
```

### `createPR`

```ts
/**
 * Create a PR: allocate number, create associated branch, and insert the PR record.
 */
export const createPR: Command<
  CreatePRCommand,
  typeof pullRequest.$inferSelect
> = async (ctx: DbContext, command: { projectId: string; title: string; body: string; reviewers: { type: "user" | "agent"; id: string; }[]; authorId?: string | undefined; authorAgentId?: number | undefined; issueId?: number | undefined; metadata?: any; type?: "MANUAL" | "AUTO_TRANSLATE" | undefined; targetLanguageId?: string | undefined; branchName?: string | undefined; }) => {...}
```

### `mergePR`

```ts
/**
 * Merge a PR: set PR status to MERGED and update associated branch to MERGED. Fires pr:merged event.
 */
export const mergePR: Command<
  MergePRCommand,
  typeof pullRequest.$inferSelect
> = async (ctx: DbContext, command: { prId: number; mergedBy: string; }) => {...}
```

### `submitReview`

```ts
/**
 * Submit a PR review: APPROVE keeps the PR in REVIEW (or moves back to OPEN if CHANGES_REQUESTED),
 * CHANGES_REQUESTED sets PR status to CHANGES_REQUESTED.
 */
export const submitReview: Command<
  SubmitReviewCommand,
  typeof pullRequest.$inferSelect
> = async (ctx: DbContext, command: { prId: number; reviewerId: string; decision: "APPROVE" | "CHANGES_REQUESTED"; }) => {...}
```

### `updatePRStatus`

```ts
/**
 * Update PR status (state machine transitions: DRAFT→OPEN→REVIEW→MERGED/CLOSED etc.).
 */
export const updatePRStatus: Command<
  UpdatePRStatusCommand,
  typeof pullRequest.$inferSelect
> = async (ctx: DbContext, command: { prId: number; status: "OPEN" | "CLOSED" | "DRAFT" | "REVIEW" | "CHANGES_REQUESTED" | "MERGED"; }) => {...}
```

### `updatePR`

```ts
/**
 * Update a PR's title, body, or reviewers list.
 */
export const updatePR: Command<
  UpdatePRCommand,
  typeof pullRequest.$inferSelect
> = async (ctx: DbContext, command: { prId: number; title?: string | undefined; body?: string | undefined; reviewers?: { type: "user" | "agent"; id: string; }[] | undefined; metadata?: any; }) => {...}
```

### packages/domain/src/commands/qa

### `createQaResultItems`

```ts
export const createQaResultItems: Command<CreateQaResultItemsCommand> = async (ctx: DbContext, command: { resultId: number; items: { isPassed: boolean; checkerId: number; meta?: z.core.util.JSONType | undefined; }[]; }) => {...}
```

### `createQaResultWithItems`

```ts
export const createQaResultWithItems: Command<
  CreateQaResultWithItemsCommand,
  CreateQaResultWithItemsResult
> = async (ctx: DbContext, command: { translationId: number; items: { isPassed: boolean; checkerId: number; meta?: z.core.util.JSONType | undefined; }[]; }) => {...}
```

### `createQaResult`

```ts
export const createQaResult: Command<
  CreateQaResultCommand,
  { id: number }
> = async (ctx: DbContext, command: { translationId: number; }) => {...}
```

### packages/domain/src/commands/qa-review

### `claimQaReviewQueueItem`

```ts
/**
 * Mark a QA review queue item as claimed and record the claimant.
 */
export const claimQaReviewQueueItem: Command<
  ClaimQaReviewQueueItemCommand,
  typeof qaReviewQueueItem.$inferSelect
> = async (ctx: DbContext, input: { queueItemId: number; userId: string; }) => {...}
```

### `createQaReviewAnnotation`

```ts
/**
 * Create an annotation under a QA review queue item and update queue activity counters.
 */
export const createQaReviewAnnotation: Command<
  CreateQaReviewAnnotationCommand,
  typeof qaReviewAnnotation.$inferSelect
> = async (ctx: DbContext, input: { queueItemId: number; intent: "ACTION_REQUIRED" | "SUGGESTION" | "QUESTION" | "NOTE" | "PRAISE" | "WONT_FIX"; body: string; isPromotable: boolean; findingId?: number | undefined; targetRange?: { start: number; end: number; } | undefined; quote?: string | undefined; parentAnnotationId?: number | undefined; authorId?: string | undefined; authorAgentId?: number | undefined; }) => {...}
```

### `createQaReviewRunWithFindings`

```ts
/**
 * Create a QA review run and its findings in the same transaction.
 */
export const createQaReviewRunWithFindings: Command<
  CreateQaReviewRunWithFindingsCommand,
  CreateQaReviewRunWithFindingsResult
> = async (ctx: DbContext, input: { projectId: string; elementId: number; translationId: number | null; layer: "DETERMINISTIC" | "SEMANTIC"; status: "COMPLETED" | "FAILED" | "PARTIAL" | "SKIPPED"; riskScore: number; findings: { layer: "DETERMINISTIC" | "SEMANTIC"; ruleId: string; ruleFamily: string; severity: "error" | "warning" | "info"; action: "BLOCK_APPROVAL" | "NEEDS_REVIEW" | "INFORMATIONAL" | "PASS" | "SUPPRESSED"; disposition: "SUPPRESSED" | "OPEN" | "CONFIRMED" | "FALSE_POSITIVE" | "ACCEPTED" | "SUPERSEDED"; confidenceBasisPoints: number; riskScore: number; message: string; explanation: string | null; sourceSpan: { tokenIndex?: number | undefined; textRange?: { start: number; end: number; } | undefined; quote?: string | undefined; } | null; targetSpan: { tokenIndex?: number | undefined; textRange?: { start: number; end: number; } | undefined; quote?: string | undefined; } | null; suggestedText: string | null; meta: any; checkerServiceId?: number | null | undefined; qaResultItemId?: number | null | undefined; }[]; qaResultId?: number | null | undefined; profileId?: number | null | undefined; branchId?: number | null | undefined; pullRequestId?: number | null | undefined; checkerServiceId?: number | null | undefined; modelServiceId?: number | null | undefined; summary?: string | null | undefined; errorMessage?: string | null | undefined; meta?: { profileId?: number | null | undefined; traceId?: string | undefined; deterministicOnly?: boolean | undefined; rawError?: string | undefined; } | null | undefined; }) => {...}
```

### `createQaReviewSuggestion`

```ts
/**
 * Create the unique suggestion record for an annotation whose intent is `SUGGESTION`.
 */
export const createQaReviewSuggestion: Command<
  CreateQaReviewSuggestionCommand,
  typeof qaReviewSuggestion.$inferSelect
> = async (ctx: DbContext, input: { annotationId: number; proposedText: string; targetRange?: { start: number; end: number; } | undefined; }) => {...}
```

### `markQaReviewSuggestionApplied`

```ts
/**
 * Mark a QA review suggestion as applied and accept the corresponding annotation.
 */
export const markQaReviewSuggestionApplied: Command<
  MarkQaReviewSuggestionAppliedCommand,
  typeof qaReviewSuggestion.$inferSelect
> = async (ctx: DbContext, input: { suggestionId: number; expectedStatus: "OPEN"; appliedTranslationId?: number | undefined; appliedChangesetEntryId?: number | undefined; appliedBy?: string | undefined; }) => {...}
```

### `materializeQaReviewQueueItem`

```ts
/**
 * Materialize or update a QA review queue item from the current translation findings.
 */
export const materializeQaReviewQueueItem: Command<
  MaterializeQaReviewQueueItemCommand,
  MaterializeQaReviewQueueItemResult
> = async (ctx: DbContext, input: { projectId: string; languageId: string; elementId: number; translationId?: number | null | undefined; branchId?: number | null | undefined; pullRequestId?: number | null | undefined; }) => {...}
```

### `rejectQaReviewSuggestion`

```ts
/**
 * Reject an open QA review suggestion and reject the corresponding annotation.
 */
export const rejectQaReviewSuggestion: Command<
  RejectQaReviewSuggestionCommand,
  typeof qaReviewSuggestion.$inferSelect
> = async (ctx: DbContext, input: { suggestionId: number; rejectedBy: string; rejectionReason: string; expectedStatus: "OPEN"; }) => {...}
```

### `submitQaReviewDecision`

```ts
/**
 * Submit a QA review decision and perform finding closure plus optimistic concurrency checks when needed.
 */
export const submitQaReviewDecision: Command<
  SubmitQaReviewDecisionCommandInput,
  typeof qaReviewDecision.$inferSelect
> = async (ctx: DbContext, input: { queueItemId: number; decision: "REQUEST_CHANGES" | "PRAISE" | "APPROVE" | "REJECT_CANDIDATE" | "CLOSE_FINDING" | "DEFER"; reason: string; expectedVersion: number; overrideBlocking: boolean; reviewerId: string; findingId?: number | undefined; findingDisposition?: "SUPPRESSED" | "FALSE_POSITIVE" | "ACCEPTED" | undefined; annotationId?: number | undefined; }) => {...}
```

### `transitionQaReviewAnnotation`

```ts
/**
 * Transition a QA review annotation according to the explicit state machine and sync queue unresolved counts.
 */
export const transitionQaReviewAnnotation: Command<
  TransitionQaReviewAnnotationCommand,
  typeof qaReviewAnnotation.$inferSelect
> = async (ctx: DbContext, input: { annotationId: number; status: "REJECTED" | "OPEN" | "ACCEPTED" | "SUPERSEDED" | "RESOLVED" | "HIDDEN"; actorId?: string | undefined; reason?: string | undefined; }) => {...}
```

### packages/domain/src/commands/sequence

### `allocateNumber`

```ts
/**
 * Atomically increments the project_sequence and returns the allocated number.
 * Auto-initializes if no record exists for the given projectId.
 */
export const allocateNumber: Command<AllocateNumberCommand, number> = async (ctx: DbContext, command: { projectId: string; }) => {...}
```

### packages/domain/src/commands/session

### `createSessionRecord`

```ts
export const createSessionRecord: Command<CreateSessionRecordCommand> = async (ctx: DbContext, command: CreateSessionRecordCommand) => {...}
```

### `revokeSessionRecord`

```ts
export const revokeSessionRecord: Command<RevokeSessionRecordCommand> = async (ctx: DbContext, command: RevokeSessionRecordCommand) => {...}
```

### packages/domain/src/commands/setting

### `setSetting`

```ts
export const setSetting: Command<SetSettingCommand> = async (ctx: DbContext, command: { key: string; value: NonNullJSONType; }) => {...}
```

### packages/domain/src/commands/string

### `attachChunkSetToString`

```ts
/**
 * Attach vectorization results (ChunkSet) to existing VectorizedString rows and set status to ACTIVE.
 */
export const attachChunkSetToString: Command<
  AttachChunkSetToStringCommand
> = async (ctx: DbContext, command: { updates: { stringId: number; chunkSetId: number; }[]; }) => {...}
```

### `createChunkSet`

```ts
export const createChunkSet: Command<
  CreateChunkSetCommand,
  typeof chunkSet.$inferSelect
> = async (ctx: DbContext, _command: Record) => {...}
```

### `createVectorizedStrings`

```ts
export const createVectorizedStrings: Command<
  CreateVectorizedStringsCommand,
  number[]
> = async (ctx: DbContext, command: { data: { text: string; languageId: string; }[]; chunkSetIds?: number[] | undefined; }) => {...}
```

### `updateVectorizedStringStatus`

```ts
/**
 * Batch-update the status of VectorizedString rows (for state machine transitions such as marking VECTORIZE_FAILED).
 */
export const updateVectorizedStringStatus: Command<
  UpdateVectorizedStringStatusCommand
> = async (ctx: DbContext, command: { stringIds: number[]; status: string; }) => {...}
```

### packages/domain/src/commands/translation

### `approveTranslation`

```ts
export const approveTranslation: Command<ApproveTranslationCommand> = async (ctx: DbContext, command: { translationId: number; }) => {...}
```

### `autoApproveContentNodeTranslations`

```ts
/**
 * Auto-approve the latest translation for each element under a content node in the target language.
 *
 * @returns Number of elements approved.
 */
export const autoApproveContentNodeTranslations: Command<
  AutoApproveContentNodeTranslationsCommand,
  number
> = async (ctx: DbContext, command: { contentNodeId: string; languageId: string; }) => {...}
```

### `autoApproveOperationScopeTranslations`

```ts
/**
 * Auto-approve the latest translation for the provided element set in the target language.
 *
 * @returns Number of elements approved.
 */
export const autoApproveOperationScopeTranslations: Command<
  AutoApproveOperationScopeTranslationsCommand,
  number
> = async (ctx: DbContext, command: { elementIds: number[]; languageId: string; }) => {...}
```

### `createProjectTranslationSnapshot`

```ts
/**
 * Create a translation snapshot for the project, recording all currently approved translations.
 *
 * @returns The snapshot ID.
 */
export const createProjectTranslationSnapshot: Command<
  CreateProjectTranslationSnapshotCommand,
  number
> = async (ctx: DbContext, command: { projectId: string; creatorId?: string | undefined; }) => {...}
```

### `createTranslations`

```ts
export const createTranslations: Command<
  CreateTranslationsCommand,
  number[]
> = async (ctx: DbContext, command: { data: { translatableElementId: number; stringId: number; translatorId?: string | null | undefined; meta?: z.core.util.JSONType | undefined; }[]; }) => {...}
```

### `deleteTranslation`

```ts
export const deleteTranslation: Command<DeleteTranslationCommand> = async (ctx: DbContext, command: { translationId: number; }) => {...}
```

### `unapproveTranslation`

```ts
export const unapproveTranslation: Command<
  UnapproveTranslationCommand
> = async (ctx: DbContext, command: { translationId: number; }) => {...}
```

### `upsertTranslationVote`

```ts
export const upsertTranslationVote: Command<
  UpsertTranslationVoteCommand,
  typeof translationVote.$inferSelect
> = async (ctx: DbContext, command: { translationId: number; voterId: string; value: number; }) => {...}
```

### packages/domain/src/commands/user

### `createUser`

```ts
export const createUser: Command<
  CreateUserCommand,
  typeof user.$inferSelect
> = async (ctx: DbContext, command: { email: string; name: string; }) => {...}
```

### `updateUserAvatar`

```ts
export const updateUserAvatar: Command<UpdateUserAvatarCommand> = async (ctx: DbContext, command: { userId: string; fileId: number; }) => {...}
```

### `updateUser`

```ts
export const updateUser: Command<
  UpdateUserCommand,
  typeof user.$inferSelect
> = async (ctx: DbContext, command: { userId: string; name: string; }) => {...}
```

### packages/domain/src/commands/vector

### `bulkUpdateChunkVectorMetadata`

```ts
export const bulkUpdateChunkVectorMetadata: Command<
  BulkUpdateChunkVectorMetadataCommand,
  BulkUpdateChunkVectorMetadataResult
> = async (ctx: DbContext, command: { chunkIds: number[]; vectorizerId: number; vectorStorageId: number; }) => {...}
```

### `createVectorizedChunks`

```ts
export const createVectorizedChunks: Command<
  CreateVectorizedChunksCommand,
  CreateVectorizedChunksResult
> = async (ctx: DbContext, command: { vectorizerId: number; vectorStorageId: number; chunkSetCount: number; chunks: { textIndex: number; meta?: z.core.util.JSONType | undefined; }[]; }) => {...}
```

### `ensureVectorStorageSchema`

```ts
export const ensureVectorStorageSchema: Command<
  EnsureVectorStorageSchemaCommand
> = async (ctx: DbContext, command: { dimension: number; }) => {...}
```

### `updateVectorDimension`

```ts
export const updateVectorDimension: Command<
  UpdateVectorDimensionCommand
> = async (ctx: DbContext, command: { dimension: number; }) => {...}
```

### `upsertChunkVectors`

```ts
export const upsertChunkVectors: Command<UpsertChunkVectorsCommand> = async (ctx: DbContext, command: { chunks: { chunkId: number; vector: number[]; }[]; }) => {...}
```

### packages/domain/src/content

### `assertStructuredPayloadGraphValid`

```ts
export const assertStructuredPayloadGraphValid = (payload: StructuredContentPayload, registeredRelationTypes: readonly RegisteredRelationTypeInput[])
```

### packages/domain/src/events

### `domainEvent`

```ts
export const domainEvent = (type: T, payload: DomainEventMap[T]): EventOf<DomainEventMap, T>
```

### `createInProcessCollector`

```ts
export const createInProcessCollector = (bus: DomainEventBus): EventCollector
```

### packages/domain/src/infrastructure

### `getDbHandle`

```ts
export const getDbHandle = async (): Promise<DrizzleDB>
```

### `getRedisHandle`

```ts
export const getRedisHandle = async (): Promise<RedisConnection>
```

### packages/domain/src/queries

### `listAllProjects`

```ts
export const listAllProjects: Query<
  ListAllProjectsQuery,
  Array<typeof project.$inferSelect>
> = async (ctx: DbContext, _query: Record) => {...}
```

### `listAllUsers`

```ts
export const listAllUsers: Query<
  ListAllUsersQuery,
  Array<typeof user.$inferSelect>
> = async (ctx: DbContext, _query: Record) => {...}
```

### packages/domain/src/queries/agent

### `findAgentDefinitionByDefinitionIdAndScope`

```ts
export const findAgentDefinitionByDefinitionIdAndScope: Query<
  FindAgentDefinitionByDefinitionIdAndScopeQuery,
  typeof agentDefinition.$inferSelect | null
> = async (ctx: DbContext, query: { definitionId: string; scopeType: "GLOBAL" | "PROJECT" | "USER"; scopeId: string; }) => {...}
```

### `findAgentDefinitionByNameAndScope`

```ts
export const findAgentDefinitionByNameAndScope: Query<
  FindAgentDefinitionByNameAndScopeQuery,
  typeof agentDefinition.$inferSelect | null
> = async (ctx: DbContext, query: { name: string; scopeType: "GLOBAL" | "PROJECT" | "USER"; scopeId: string; isBuiltin?: boolean | undefined; }) => {...}
```

### `findAgentRunByDeduplicationKey`

```ts
export const findAgentRunByDeduplicationKey: Query<
  FindAgentRunByDeduplicationKeyQuery,
  AgentRunMetadataRow | null
> = async (ctx: DbContext, query: { deduplicationKey: string; }) => {...}
```

### `getAgentDefinitionByInternalId`

```ts
export const getAgentDefinitionByInternalId: Query<
  GetAgentDefinitionByInternalIdQuery,
  typeof agentDefinition.$inferSelect | null
> = async (ctx: DbContext, query: { id: number; }) => {...}
```

### `getAgentDefinition`

```ts
export const getAgentDefinition: Query<
  GetAgentDefinitionQuery,
  typeof agentDefinition.$inferSelect | null
> = async (ctx: DbContext, query: { id: string; }) => {...}
```

### `getAgentRunByInternalId`

```ts
export const getAgentRunByInternalId: Query<
  GetAgentRunByInternalIdQuery,
  AgentRunByInternalId
> = async (ctx: DbContext, query: { id: number; }) => {...}
```

### `getAgentRunInternalId`

```ts
export const getAgentRunInternalId: Query<
  GetAgentRunInternalIdQuery,
  number | null
> = async (ctx: DbContext, query: { externalId: string; }) => {...}
```

### `getAgentRunRuntimeState`

```ts
export const getAgentRunRuntimeState: Query<
  GetAgentRunRuntimeStateQuery,
  AgentRunRuntimeState | null
> = async (ctx: DbContext, query: { runId: string; }) => {...}
```

### `getAgentSessionByExternalId`

```ts
export const getAgentSessionByExternalId: Query<
  GetAgentSessionByExternalIdQuery,
  AgentSessionByExternalId | null
> = async (ctx: DbContext, query: { externalId: string; userId?: string | undefined; }) => {...}
```

### `getAgentSessionRuntimeState`

```ts
export const getAgentSessionRuntimeState: Query<
  GetAgentSessionRuntimeStateQuery,
  AgentSessionRuntimeState | null
> = async (ctx: DbContext, query: { sessionId: number; }) => {...}
```

### `getLatestCompletedRunBlackboard`

```ts
export const getLatestCompletedRunBlackboard: Query<
  GetLatestCompletedRunBlackboardQuery,
  LatestCompletedRunBlackboard
> = async (ctx: DbContext, query: { sessionId: number; }) => {...}
```

### `getRunNodeEvents`

```ts
export const getRunNodeEvents: Query<
  GetRunNodeEventsQuery,
  RunNodeEventRow[]
> = async (ctx: DbContext, query: { runExternalId: string; nodeId: string; }) => {...}
```

### `listAgentDefinitions`

```ts
export const listAgentDefinitions: Query<
  ListAgentDefinitionsQuery,
  Array<typeof agentDefinition.$inferSelect>
> = async (ctx: DbContext, query: { scopeType?: "GLOBAL" | "PROJECT" | "USER" | undefined; scopeId?: string | undefined; type?: "GENERAL" | "GHOST_TEXT" | "WORKFLOW" | undefined; isBuiltin?: boolean | undefined; }) => {...}
```

### `listAgentEvents`

```ts
export const listAgentEvents: Query<
  ListAgentEventsQuery,
  AgentEventRow[]
> = async (ctx: DbContext, query: { runInternalId: number; }) => {...}
```

### `listAgentRunSnapshotsBySession`

```ts
export const listAgentRunSnapshotsBySession: Query<
  z.infer<typeof ListAgentRunSnapshotsBySessionQuerySchema>,
  AgentRunSnapshotBySessionRow[]
> = async (ctx: DbContext, query: { sessionId: number; }) => {...}
```

### `listAgentSessions`

```ts
export const listAgentSessions: Query<
  ListAgentSessionsQuery,
  Array<typeof agentSession.$inferSelect>
> = async (ctx: DbContext, query: { userId: string; limit: number; offset: number; agentDefinitionId?: string | undefined; projectId?: string | undefined; }) => {...}
```

### `listProjectRuns`

```ts
export const listProjectRuns: Query<
  ListProjectRunsQuery,
  ProjectRunRow[]
> = async (ctx: DbContext, query: { projectId: string; limit: number; offset: number; status?: "running" | "completed" | "failed" | "cancelled" | "pending" | "paused" | undefined; }) => {...}
```

### `loadAgentExternalOutputByIdempotency`

```ts
export const loadAgentExternalOutputByIdempotency: Query<
  LoadAgentExternalOutputByIdempotencyQuery,
  AgentExternalOutputRow | null
> = async (ctx: DbContext, query: { runInternalId: number; idempotencyKey: string; }) => {...}
```

### `loadAgentRunMetadata`

```ts
export const loadAgentRunMetadata: Query<
  LoadAgentRunMetadataQuery,
  AgentRunMetadataRow | null
> = async (ctx: DbContext, query: { externalId: string; }) => {...}
```

### `loadAgentRunSnapshot`

```ts
export const loadAgentRunSnapshot: Query<
  LoadAgentRunSnapshotQuery,
  JSONType
> = async (ctx: DbContext, query: { externalId: string; }) => {...}
```

### packages/domain/src/queries/api-key

### `getApiKeyByHash`

```ts
export const getApiKeyByHash: Query<
  GetApiKeyByHashQuery,
  ApiKeyRow | null
> = async (ctx: DbContext, query: GetApiKeyByHashQuery) => {...}
```

### `listApiKeysByUser`

```ts
export const listApiKeysByUser: Query<
  ListApiKeysByUserQuery,
  ApiKeyRow[]
> = async (ctx: DbContext, query: ListApiKeysByUserQuery) => {...}
```

### packages/domain/src/queries/auth

### `findAccountByProviderIdentity`

```ts
export const findAccountByProviderIdentity: Query<
  FindAccountByProviderIdentityQuery,
  AccountIdentity | null
> = async (ctx: DbContext, query: { providerIssuer: string; providedAccountId: string; authProviderId: number; }) => {...}
```

### `findUserByIdentifier`

```ts
export const findUserByIdentifier: Query<
  FindUserByIdentifierQuery,
  AuthUserIdentity | null
> = async (ctx: DbContext, query: { identifier: string; }) => {...}
```

### `getAccountMetaByIdentity`

```ts
export const getAccountMetaByIdentity: Query<
  GetAccountMetaByIdentityQuery,
  JSONType | null
> = async (ctx: DbContext, query: { userId: string; providedAccountId: string; providerIssuer: string; }) => {...}
```

### `getAccountMetaByProviderAndIdentifier`

```ts
export const getAccountMetaByProviderAndIdentifier: Query<
  GetAccountMetaByProviderAndIdentifierQuery,
  JSONType | null
> = async (ctx: DbContext, query: { providedAccountId: string; providerIssuer: string; }) => {...}
```

### `getMfaPayloadByFactorAndUser`

```ts
export const getMfaPayloadByFactorAndUser: Query<
  GetMfaPayloadByFactorAndUserQuery,
  NonNullJSONType | null
> = async (ctx: DbContext, query: { userId: string; factorId: string; }) => {...}
```

### `getMfaProviderByServiceAndUser`

```ts
export const getMfaProviderByServiceAndUser: Query<
  GetMfaProviderByServiceAndUserQuery,
  typeof mfaProvider.$inferSelect | null
> = async (ctx: DbContext, query: { userId: string; mfaServiceId: number; }) => {...}
```

### packages/domain/src/queries/branch

### `getBranchById`

```ts
export const getBranchById: Query<
  GetBranchByIdQuery,
  typeof entityBranch.$inferSelect | null
> = async (ctx: DbContext, query: { branchId: number; }) => {...}
```

### `getBranch`

```ts
export const getBranch: Query<
  GetBranchQuery,
  typeof entityBranch.$inferSelect | null
> = async (ctx: DbContext, query: { id: string; }) => {...}
```

### `listBranches`

```ts
export const listBranches: Query<
  ListBranchesQuery,
  (typeof entityBranch.$inferSelect)[]
> = async (ctx: DbContext, query: { projectId: string; status?: "MERGED" | "ACTIVE" | "ABANDONED" | undefined; }) => {...}
```

### packages/domain/src/queries/changeset

### `getLatestBranchChangesetId`

```ts
export const getLatestBranchChangesetId: Query<
  GetLatestBranchChangesetIdQuery,
  number | null
> = async (ctx: DbContext, query: { branchId: number; }) => {...}
```

### `getLatestMainChangesetId`

```ts
export const getLatestMainChangesetId: Query<
  GetLatestMainChangesetIdQuery,
  number | null
> = async (ctx: DbContext, query: { projectId: string; }) => {...}
```

### `listBranchChangesetIds`

```ts
export const listBranchChangesetIds: Query<
  ListBranchChangesetIdsQuery,
  number[]
> = async (ctx: DbContext, query: { branchId: number; }) => {...}
```

### `listMainEntriesSince`

```ts
export const listMainEntriesSince: Query<
  ListMainEntriesSinceQuery,
  (typeof changesetEntry.$inferSelect)[]
> = async (ctx: DbContext, query: { projectId: string; baseChangesetId: number; }) => {...}
```

### `getChangeset`

```ts
export const getChangeset: Query<
  GetChangesetQuery,
  typeof changeset.$inferSelect | null
> = async (ctx: DbContext, query: { changesetId: number; }) => {...}
```

### `getChangesetByExternalId`

```ts
export const getChangesetByExternalId: Query<
  GetChangesetByExternalIdQuery,
  typeof changeset.$inferSelect | null
> = async (ctx: DbContext, query: { externalId: string; }) => {...}
```

### `listChangesets`

```ts
export const listChangesets: Query<
  ListChangesetsQuery,
  (typeof changeset.$inferSelect)[]
> = async (ctx: DbContext, query: { projectId: string; limit: number; offset: number; status?: "PENDING" | "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED" | "APPLIED" | "CONFLICT" | undefined; }) => {...}
```

### `getChangesetEntries`

```ts
export const getChangesetEntries: Query<
  GetChangesetEntriesQuery,
  (typeof changesetEntry.$inferSelect)[]
> = async (ctx: DbContext, query: { changesetId: number; entityType?: "project" | "content_node" | "content_relation" | "context_evidence" | "context_profile" | "element" | "term" | "translation" | "comment" | "auto_translation" | "content_relation_type" | "scope_binding" | "semantic_diff" | "comment_reaction" | "term_concept" | "memory_item" | "project_settings" | "project_member" | "project_attributes" | "issue" | undefined; }) => {...}
```

### `listBranchChangesetEntries`

```ts
export const listBranchChangesetEntries: Query<
  ListBranchChangesetEntriesQuery,
  (typeof changesetEntry.$inferSelect)[]
> = async (ctx: DbContext, query: { branchId: number; entityType?: "project" | "content_node" | "content_relation" | "context_evidence" | "context_profile" | "element" | "term" | "translation" | "comment" | "auto_translation" | "content_relation_type" | "scope_binding" | "semantic_diff" | "comment_reaction" | "term_concept" | "memory_item" | "project_settings" | "project_member" | "project_attributes" | "issue" | undefined; entityId?: string | undefined; limit?: number | undefined; }) => {...}
```

### packages/domain/src/queries/chunk

### `listAllChunks`

```ts
export const listAllChunks: Query<
  ListAllChunksQuery,
  Array<typeof chunk.$inferSelect>
> = async (ctx: DbContext, _: Record) => {...}
```

### packages/domain/src/queries/comment

### `getCommentRecipient`

```ts
/**
 * Resolve the notification recipient for a comment: reply author or translation author. Returns null when same as commenter.
 */
export const getCommentRecipient: Query<
  GetCommentRecipientQuery,
  { recipientId: string; commenterId: string } | null
> = async (ctx: DbContext, query: { commentId: number; }) => {...}
```

### `listChildComments`

```ts
export const listChildComments: Query<
  ListChildCommentsQuery,
  Array<typeof comment.$inferSelect>
> = async (ctx: DbContext, query: { rootCommentId: number; }) => {...}
```

### `listCommentReactions`

```ts
export const listCommentReactions: Query<
  ListCommentReactionsQuery,
  Array<typeof commentReaction.$inferSelect>
> = async (ctx: DbContext, query: { commentId: number; }) => {...}
```

### `listRootComments`

```ts
export const listRootComments: Query<
  ListRootCommentsQuery,
  Array<typeof comment.$inferSelect>
> = async (ctx: DbContext, query: { targetType: "ELEMENT" | "TRANSLATION"; targetId: number; pageIndex: number; pageSize: number; }) => {...}
```

### packages/domain/src/queries/content

### `countContentNodeElements`

```ts
/**
 * Count translatable elements under a content node matching the given filters.
 */
export const countContentNodeElements: Query<
  CountContentNodeElementsQuery,
  number
> = async (ctx: DbContext, query: { contentNodeId: string; searchQuery?: string | undefined; isApproved?: boolean | undefined; isTranslated?: boolean | undefined; languageId?: string | undefined; }) => {...}
```

### `countContentNodeTranslations`

```ts
/**
 * Count translations for a given language under a content node.
 */
export const countContentNodeTranslations: Query<
  CountContentNodeTranslationsQuery,
  number
> = async (ctx: DbContext, query: { contentNodeId: string; languageId: string; isApproved?: boolean | undefined; }) => {...}
```

### `buildEditorScopeElementFilterSql`

```ts
/**
 * Build the shared CTE/filter SQL used by editor-scope element queries.
 */
export const buildEditorScopeElementFilterSql = (query: EditorScopeSqlInput): import("drizzle-orm").SQL<unknown>
```

### `listEditorScopeElements`

```ts
/**
 * List elements by editor scope with pagination; an empty `contentNodeIds` means the whole project.
 */
export const listEditorScopeElements: Query<
  ListEditorScopeElementsQuery,
  EditorElement[]
> = async (ctx: DbContext, query: { projectId: string; languageToId: string; contentNodeIds: string[]; searchQuery: string; statusFilter: "all" | "untranslated" | "translated" | "approved" | "unapproved"; pageSize: number; page: number; branchId?: number | undefined; }) => {...}
```

### `countEditorScopeElements`

```ts
/**
 * Count the elements matching filters inside the editor scope.
 */
export const countEditorScopeElements: Query<
  CountEditorScopeElementsQuery,
  number
> = async (ctx: DbContext, query: CountEditorScopeElementsQuery) => {...}
```

### `getEditorScopeFirstElement`

```ts
/**
 * Get the first matching element in the editor scope, or the first one after a given element.
 */
export const getEditorScopeFirstElement: Query<
  GetEditorScopeFirstElementQuery,
  EditorElement | null
> = async (ctx: DbContext, query: { projectId: string; languageToId: string; contentNodeIds: string[]; searchQuery: string; statusFilter: "all" | "untranslated" | "translated" | "approved" | "unapproved"; branchId?: number | undefined; afterElementId?: number | undefined; }) => {...}
```

### `getEditorScopeElementPageIndex`

```ts
/**
 * Calculate the zero-based page index of an element under the same editor scope and filters; returns `null` if the element is out of scope.
 */
export const getEditorScopeElementPageIndex: Query<
  GetEditorScopeElementPageIndexQuery,
  number | null
> = async (ctx: DbContext, query: { projectId: string; languageToId: string; contentNodeIds: string[]; searchQuery: string; statusFilter: "all" | "untranslated" | "translated" | "approved" | "unapproved"; pageSize: number; elementId: number; branchId?: number | undefined; }) => {...}
```

### `findProjectContentNodeByLabel`

```ts
/**
 * Find a content node in a project by displayLabel (optionally filtered by kind).
 */
export const findProjectContentNodeByLabel: Query<
  FindProjectContentNodeByLabelQuery,
  typeof contentNode.$inferSelect | null
> = async (ctx: DbContext, query: { projectId: string; displayLabel: string; kind?: "FILE" | "DIRECTORY" | "MARKDOWN_SECTION" | "SOURCE_COMPONENT" | "CUSTOM" | undefined; }) => {...}
```

### `getContentNodeBlobInfo`

```ts
/**
 * Get the blob storage info (key, storageProviderId, fileName) for the content node's file.
 */
export const getContentNodeBlobInfo: Query<
  GetContentNodeBlobInfoQuery,
  ContentNodeBlobInfo | null
> = async (ctx: DbContext, query: { contentNodeId: string; }) => {...}
```

### `getContentNodeElementPageIndex`

```ts
/**
 * Get the page index of an element within its content node's element list (ordered by localOrder).
 */
export const getContentNodeElementPageIndex: Query<
  GetContentNodeElementPageIndexQuery,
  number
> = async (ctx: DbContext, query: { elementId: number; pageSize: number; searchQuery?: string | undefined; isApproved?: boolean | undefined; isTranslated?: boolean | undefined; languageId?: string | undefined; }) => {...}
```

### `getContentNodeElements`

```ts
export const getContentNodeElements: Query<
  GetContentNodeElementsQuery,
  ContentNodeElementRow[]
> = async (ctx: DbContext, query: { contentNodeId: string; page: number; pageSize: number; searchQuery?: string | undefined; isApproved?: boolean | undefined; isTranslated?: boolean | undefined; languageId?: string | undefined; }) => {...}
```

### `getContentNodeFirstElement`

```ts
/**
 * Get the first translatable element under a content node matching the given filters.
 */
export const getContentNodeFirstElement: Query<
  GetContentNodeFirstElementQuery,
  ContentNodeElementRow | null
> = async (ctx: DbContext, query: { contentNodeId: string; searchQuery?: string | undefined; greaterThan?: number | undefined; afterElementId?: number | undefined; isApproved?: boolean | undefined; isTranslated?: boolean | undefined; languageId?: string | undefined; }) => {...}
```

### `getContentNode`

```ts
export const getContentNode: Query<
  GetContentNodeQuery,
  typeof contentNode.$inferSelect | null
> = async (ctx: DbContext, query: { id: string; }) => {...}
```

### `getContentRelation`

```ts
/**
 * Fetch a single ContentRelation row by ID.
 */
export const getContentRelation: Query<
  GetContentRelationQuery,
  typeof contentRelation.$inferSelect | null
> = async (ctx: DbContext, query: { id: string; }) => {...}
```

### `getContextEvidence`

```ts
/**
 * Fetch a single ContextEvidence row by ID.
 */
export const getContextEvidence: Query<
  GetContextEvidenceQuery,
  typeof contextEvidence.$inferSelect | null
> = async (ctx: DbContext, query: { id: number; }) => {...}
```

### `getElementTranslationStatus`

```ts
/**
 * Get the translation status for a single translatable element.
 */
export const getElementTranslationStatus: Query<
  GetElementTranslationStatusQuery,
  ElementTranslationStatus
> = async (ctx: DbContext, query: { elementId: number; languageId: string; }) => {...}
```

### `getProjectRootContentNode`

```ts
/**
 * Get the root content node of a project (kind = PROJECT_ROOT).
 */
export const getProjectRootContentNode: Query<
  GetProjectRootContentNodeQuery,
  typeof contentNode.$inferSelect | null
> = async (ctx: DbContext, query: { projectId: string; }) => {...}
```

### `listContentNodeElementIds`

```ts
/**
 * Get all translatable element IDs that belong to a content node (primary relations).
 */
export const listContentNodeElementIds: Query<
  ListContentNodeElementIdsQuery,
  number[]
> = async (ctx: DbContext, query: { contentNodeId: string; }) => {...}
```

### `listContentNodeElementsWithChunkIds`

```ts
/**
 * Get all elements under a content node along with their chunk IDs (for batch auto-translation).
 */
export const listContentNodeElementsWithChunkIds: Query<
  ListContentNodeElementsWithChunkIdsQuery,
  ContentNodeElementWithChunkIds[]
> = async (ctx: DbContext, query: { contentNodeId: string; }) => {...}
```

### `listEditorScopeContentNodes`

```ts
/**
 * List content nodes visible for a project under main or branch-overlay visibility.
 */
export const listEditorScopeContentNodes: Query<
  ListEditorScopeContentNodesQuery,
  ProjectContentNodeRow[]
> = async (ctx: DbContext, query: { projectId: string; branchId?: number | undefined; }) => {...}
```

### `listProjectContentNodes`

```ts
export const listProjectContentNodes: Query<
  ListProjectContentNodesQuery,
  ProjectContentNodeRow[]
> = async (ctx: DbContext, query: { projectId: string; }) => {...}
```

### packages/domain/src/queries/context

### `assembleContextEvidence`

```ts
export const assembleContextEvidence: Query<
  AssembleContextEvidenceQuery,
  FlattenedContextEvidence[]
> = async (ctx: DbContext, query: { elementId: number; purpose: "QA" | "EDITOR" | "RECALL" | "AI" | "AGENT"; profileId?: string | undefined; maxItems?: number | undefined; maxTokens?: number | undefined; includeExpansion?: boolean | undefined; }) => {...}
```

### `getEffectiveContextProfile`

```ts
export const getEffectiveContextProfile: Query<
  GetEffectiveContextProfileQuery,
  EffectiveContextProfile
> = async (ctx: DbContext, query: { projectId: string; profileId?: string | undefined; }) => {...}
```

### packages/domain/src/queries/cross-reference

### `listReferencesFrom`

```ts
/**
 * Forward lookup: given a source, list all targets it references.
 */
export const listReferencesFrom: Query<
  ListReferencesFromQuery,
  (typeof crossReference.$inferSelect)[]
> = async (ctx: DbContext, query: { sourceType: "issue" | "pr" | "issue_comment"; sourceId: number; }) => {...}
```

### `listReferencesTo`

```ts
/**
 * Reverse lookup: given a target (Issue or PR), list all sources that reference it.
 */
export const listReferencesTo: Query<
  ListReferencesToQuery,
  (typeof crossReference.$inferSelect)[]
> = async (ctx: DbContext, query: { targetType: "issue" | "pr"; targetId: number; }) => {...}
```

### packages/domain/src/queries/element

### `getElementContexts`

```ts
export const getElementContexts: Query<
  GetElementContextsQuery,
  GetElementContextsResult
> = async (ctx: DbContext, query: { elementId: number; purpose: "QA" | "EDITOR" | "RECALL" | "AI" | "AGENT"; maxItems?: number | undefined; }) => {...}
```

### `getElementMeta`

```ts
export const getElementMeta: Query<
  GetElementMetaQuery,
  JSONType | null
> = async (ctx: DbContext, query: { elementId: number; }) => {...}
```

### `getElementProject`

```ts
/**
 * Get the projectId the element belongs to (directly from translatableElement table).
 */
export const getElementProject: Query<
  GetElementProjectQuery,
  { projectId: string } | null
> = async (ctx: DbContext, query: { elementId: number; }) => {...}
```

### `getElementSourceLocation`

```ts
/**
 * Get the source file location info for an element (for editor source navigation).
 */
export const getElementSourceLocation: Query<
  GetElementSourceLocationQuery,
  ElementSourceLocation
> = async (ctx: DbContext, query: { elementId: number; }) => {...}
```

### `getElementWithChunkIds`

```ts
/**
 * Get a single element's source text and its chunk IDs (for vector recall).
 */
export const getElementWithChunkIds: Query<
  GetElementWithChunkIdsQuery,
  ElementWithChunkIds | null
> = async (ctx: DbContext, query: { elementId: number; }) => {...}
```

### `getTranslatableElementRow`

```ts
/**
 * Get the full `TranslatableElement` table row by element ID.
 */
export const getTranslatableElementRow: Query<
  GetTranslatableElementRowQuery,
  typeof translatableElement.$inferSelect | null
> = async (ctx: DbContext, query: { elementId: number; }) => {...}
```

### `listAllElements`

```ts
export const listAllElements: Query<
  ListAllElementsQuery,
  Array<typeof translatableElement.$inferSelect>
> = async (ctx: DbContext, _query: Record) => {...}
```

### `listCachedVectorizedStrings`

```ts
export const listCachedVectorizedStrings: Query<
  ListCachedVectorizedStringsQuery,
  CachedVectorizedString[]
> = async (ctx: DbContext, query: { items: { text: string; languageId: string; }[]; }) => {...}
```

### `listElementComments`

```ts
/**
 * Query comments on an element with their replies, ordered by most recent.
 */
export const listElementComments: Query<
  ListElementCommentsQuery,
  CommentThread[]
> = async (ctx: DbContext, query: { elementId: number; maxCount: number; }) => {...}
```

### `listElementSourceTexts`

```ts
/**
 * Batch-fetch element source texts via the vectorizedString join.
 */
export const listElementSourceTexts: Query<
  ListElementSourceTextsQuery,
  ElementSourceText[]
> = async (ctx: DbContext, query: { elementIds: number[]; }) => {...}
```

### `listElementsByImporterScope`

```ts
export const listElementsByImporterScope: Query<
  ListElementsByImporterScopeQuery,
  ElementByImporterScopeRow[]
> = async (ctx: DbContext, query: { projectId: string; importerId: string; sourceRootRef: string; }) => {...}
```

### `listElementsForDiff`

```ts
/**
 * Get element data for diff display by a list of element IDs.
 */
export const listElementsForDiff: Query<
  ListElementsForDiffQuery,
  ElementForDiff[]
> = async (ctx: DbContext, query: { elementIds: number[]; }) => {...}
```

### `listElementsWithChunkIdsByIds`

```ts
/**
 * Batch-fetch element source text, project, primary content node, and chunk ids.
 */
export const listElementsWithChunkIdsByIds: Query<
  ListElementsWithChunkIdsByIdsQuery,
  ElementWithChunkIdsById[]
> = async (ctx: DbContext, query: { elementIds: number[]; }) => {...}
```

### `listNeighborElements`

```ts
export const listNeighborElements: Query<
  ListNeighborElementsQuery,
  { before: NeighborElementRow[]; after: NeighborElementRow[] }
> = async (ctx: DbContext, query: { elementId: number; before: number; after: number; }) => {...}
```

### packages/domain/src/queries/file

### `getActiveFileBlobInfo`

```ts
export const getActiveFileBlobInfo: Query<
  GetActiveFileBlobInfoQuery,
  ActiveFileBlobInfo | null
> = async (ctx: DbContext, query: { fileId: number; }) => {...}
```

### `getActiveFileName`

```ts
export const getActiveFileName: Query<
  GetActiveFileNameQuery,
  string | null
> = async (ctx: DbContext, query: { fileId: number; }) => {...}
```

### `getBlobByKey`

```ts
export const getBlobByKey: Query<
  GetBlobByKeyQuery,
  typeof blob.$inferSelect | null
> = async (ctx: DbContext, query: { key: string; }) => {...}
```

### `getFile`

```ts
export const getFile: Query<
  GetFileQuery,
  typeof file.$inferSelect | null
> = async (ctx: DbContext, query: { fileId: number; }) => {...}
```

### `listAllFiles`

```ts
export const listAllFiles: Query<
  ListAllFilesQuery,
  Array<typeof file.$inferSelect>
> = async (ctx: DbContext, _query: Record) => {...}
```

### packages/domain/src/queries/glossary

### `countGlossaryConcepts`

```ts
export const countGlossaryConcepts: Query<
  CountGlossaryConceptsQuery,
  number
> = async (ctx: DbContext, query: { glossaryId: string; }) => {...}
```

### `fetchTermsByConceptIds`

```ts
/**
 * Fetch full term pair details for a list of concept IDs.
 *
 * Unlike `listLexicalTermSuggestions`, this does not perform any matching —
 * it simply resolves the source + translation term texts and definition for
 * the given concept IDs. Pairs with no matching term in either language are
 * omitted.
 */
export const fetchTermsByConceptIds = async (drizzle: DbHandle, conceptIds: number[], sourceLanguageId: string, translationLanguageId: string, confidenceMap?: Map<number, number>): Promise<{ term: string; translation: string; definition: string | null; conceptId: number; glossaryId: string; confidence: number; evidences: { channel: "template" | "exact" | "trgm" | "lexical" | "morphological" | "sparse" | "fragment" | "bm25" | "semantic" | "multi"; confidence: number; matchedText?: string | undefined; matchedVariantText?: string | undefined; matchedVariantType?: string | undefined; note?: string | undefined; }[]; matchedText?: string | undefined; }[]>
```

### `buildConceptVectorizationText`

````ts
/**
 * Build a structured text representation of a term concept for embedding
 * vectorization, following the genus–differentia definition method.
 *
 * Output format:
 * ```
 * Terms: creeper、苦力怕、爬行者
 * Subjects:
 *  - 敌对生物: 危险且具侵略性的生物…
 * Definition: 绿色的，会悄悄接近玩家并自爆的怪物。
 * ```
 *
 * Returns `null` if no meaningful content exists (no terms, no subjects, no
 * definition), indicating that this concept should not be vectorized.
 */
export const buildConceptVectorizationText = async (drizzle: DbHandle, conceptId: number): Promise<string | null>
````

### `getConceptRecallDetail`

```ts
/**
 * Fetch all data required to build recall variants for a single concept.
 *
 * This is a conceptId-only snapshot query: it does not filter by glossaryId
 * and does not require knowing the source / translation language in advance.
 * The caller (variant builder) is responsible for language filtering.
 */
export const getConceptRecallDetail: Query<
  GetConceptRecallDetailQuery,
  ConceptRecallDetail | null
> = async (ctx: DbContext, query: { conceptId: number; }) => {...}
```

### `getConceptVectorizationSnapshot`

```ts
export const getConceptVectorizationSnapshot: Query<
  GetConceptVectorizationSnapshotQuery,
  ConceptVectorizationSnapshot | null
> = async (ctx: DbContext, query: { conceptId: number; }) => {...}
```

### `getGlossaryConceptDetail`

```ts
export const getGlossaryConceptDetail: Query<
  GetGlossaryConceptDetailQuery,
  GlossaryConceptDetail | null
> = async (ctx: DbContext, query: { glossaryId: string; conceptId: number; }) => {...}
```

### `getGlossary`

```ts
export const getGlossary: Query<
  GetGlossaryQuery,
  typeof glossary.$inferSelect | null
> = async (ctx: DbContext, query: { glossaryId: string; }) => {...}
```

### `listAllGlossaries`

```ts
export const listAllGlossaries: Query<
  ListAllGlossariesQuery,
  Array<typeof glossary.$inferSelect>
> = async (ctx: DbContext, _query: Record) => {...}
```

### `listAllTerms`

```ts
export const listAllTerms: Query<ListAllTermsQuery, TermWithConcept[]> = async (ctx: DbContext, _query: Record) => {...}
```

### `listConceptSubjectsByConceptIds`

```ts
export const listConceptSubjectsByConceptIds: Query<
  ListConceptSubjectsByConceptIdsQuery,
  ConceptSubjectRow[]
> = async (ctx: DbContext, query: { conceptIds: number[]; }) => {...}
```

### `listGlossariesByCreator`

```ts
export const listGlossariesByCreator: Query<
  ListGlossariesByCreatorQuery,
  ListGlossariesByCreatorResult
> = async (ctx: DbContext, query: { creatorId: string; pageIndex?: number | undefined; pageSize?: number | undefined; }) => {...}
```

### `listGlossaryConceptSubjects`

```ts
export const listGlossaryConceptSubjects: Query<
  ListGlossaryConceptSubjectsQuery,
  GlossaryConceptSubject[]
> = async (ctx: DbContext, query: { glossaryId: string; }) => {...}
```

### `listGlossaryConcepts`

```ts
export const listGlossaryConcepts: Query<
  ListGlossaryConceptsQuery,
  ListGlossaryConceptsResult
> = async (ctx: DbContext, query: { glossaryId: string; pageIndex: number; pageSize: number; }) => {...}
```

### `listGlossaryTermPairs`

```ts
export const listGlossaryTermPairs: Query<
  ListGlossaryTermPairsQuery,
  ListGlossaryTermPairsResult
> = async (ctx: DbContext, query: { glossaryId: string; sourceLanguageId: string; targetLanguageId: string; pageIndex: number; pageSize: number; }) => {...}
```

### `listLexicalTermSuggestions`

```ts
export const listLexicalTermSuggestions: Query<
  ListLexicalTermSuggestionsQuery,
  LexicalTermSuggestion[]
> = async (ctx: DbContext, query: { glossaryIds: string[]; text: string; sourceLanguageId: string; translationLanguageId: string; wordSimilarityThreshold: number; }) => {...}
```

### `listMorphologicalTermSuggestions`

```ts
/**
 * Query `TermRecallVariant` by trigram similarity on `normalizedText`,
 * then assemble full term pairs via `fetchTermsByConceptIds`.
 *
 * Returns LookedUpTerm[] with confidence derived from trigram similarity.
 */
export const listMorphologicalTermSuggestions: Query<
  ListMorphologicalTermSuggestionsQuery,
  LookedUpTerm[]
> = async (ctx: DbContext, query: { glossaryIds: string[]; normalizedText: string; sourceLanguageId: string; translationLanguageId: string; minSimilarity: number; maxAmount: number; }) => {...}
```

### `listOwnedGlossaries`

```ts
export const listOwnedGlossaries: Query<
  ListOwnedGlossariesQuery,
  Array<typeof glossary.$inferSelect>
> = async (ctx: DbContext, query: { creatorId: string; }) => {...}
```

### `listProjectGlossaries`

```ts
export const listProjectGlossaries: Query<
  ListProjectGlossariesQuery,
  Array<typeof glossary.$inferSelect>
> = async (ctx: DbContext, query: { projectId: string; }) => {...}
```

### `listProjectGlossaryIds`

```ts
export const listProjectGlossaryIds: Query<
  ListProjectGlossaryIdsQuery,
  string[]
> = async (ctx: DbContext, query: { projectId: string; }) => {...}
```

### `listSemanticTermSearchRange`

```ts
export const listSemanticTermSearchRange: Query<
  ListSemanticTermSearchRangeQuery,
  SemanticTermSearchRangeRow[]
> = async (ctx: DbContext, query: { glossaryIds: string[]; }) => {...}
```

### `listTermConceptIdsByRecallVariants`

```ts
/**
 * Lightweight query that returns only the set of conceptIds whose
 * `TermRecallVariant` records match the given normalizedText by trigram
 * similarity. Used by `deduplicateAndMatchOp` to check existence without
 * fetching the full term pair data.
 */
export const listTermConceptIdsByRecallVariants: Query<
  ListTermConceptIdsByRecallVariantsQuery,
  number[]
> = async (ctx: DbContext, query: { glossaryIds: string[]; normalizedText: string; sourceLanguageId: string; minSimilarity: number; maxAmount: number; }) => {...}
```

### `listTermConceptIdsBySubject`

```ts
export const listTermConceptIdsBySubject: Query<
  ListTermConceptIdsBySubjectQuery,
  number[]
> = async (ctx: DbContext, query: { subjectId: number; }) => {...}
```

### packages/domain/src/queries/issue

### `getClaimableIssue`

```ts
/**
 * Returns the first claimable OPEN issue in the project (filtered by claimPolicy), without locking.
 * This is a "peek" query — actual atomic claim uses claim-issue.cmd with FOR UPDATE SKIP LOCKED.
 */
export const getClaimableIssue: Query<
  GetClaimableIssueQuery,
  typeof issue.$inferSelect | null
> = async (ctx: DbContext, query: { projectId: string; userId?: string | undefined; agentId?: number | undefined; }) => {...}
```

### `getIssueByNumber`

```ts
export const getIssueByNumber: Query<
  GetIssueByNumberQuery,
  typeof issue.$inferSelect | null
> = async (ctx: DbContext, query: { projectId: string; number: number; }) => {...}
```

### `getIssue`

```ts
export const getIssue: Query<
  GetIssueQuery,
  typeof issue.$inferSelect | null
> = async (ctx: DbContext, query: { id: string; }) => {...}
```

### `listIssues`

```ts
export const listIssues: Query<
  ListIssuesQuery,
  (typeof issue.$inferSelect)[]
> = async (ctx: DbContext, query: { projectId: string; limit: number; offset: number; status?: "OPEN" | "CLOSED" | undefined; label?: string | undefined; assigneeId?: string | undefined; search?: string | undefined; }) => {...}
```

### packages/domain/src/queries/issue-comment

### `listComments`

```ts
export const listComments: Query<
  ListCommentsQuery,
  (typeof issueComment.$inferSelect)[]
> = async (ctx: DbContext, query: { threadId: number; }) => {...}
```

### `listThreads`

```ts
export const listThreads: Query<
  ListThreadsQuery,
  (typeof issueCommentThread.$inferSelect & {
    comments: (typeof issueComment.$inferSelect)[];
  })[]
> = async (ctx: DbContext, query: { targetType: "issue" | "pr"; targetId: number; isReviewThread?: boolean | undefined; }) => {...}
```

### packages/domain/src/queries/language

### `getLanguage`

```ts
export const getLanguage: Query<
  GetLanguageQuery,
  typeof language.$inferSelect | null
> = async (ctx: DbContext, query: { languageId: string; }) => {...}
```

### `listAllLanguages`

```ts
export const listAllLanguages: Query<
  Record<string, never>,
  Array<typeof language.$inferSelect>
> = async (ctx: DbContext) => {...}
```

### `listLanguages`

```ts
export const listLanguages: Query<
  ListLanguagesQuery,
  ListLanguagesResult
> = async (ctx: DbContext, query: { page: number; pageSize: number; searchQuery: string; }) => {...}
```

### packages/domain/src/queries/login-attempt

### `countRecentAttempts`

```ts
export const countRecentAttempts: Query<
  CountRecentAttemptsQuery,
  number
> = async (ctx: DbContext, query: CountRecentAttemptsQuery) => {...}
```

### packages/domain/src/queries/memory

### `countMemoryItems`

```ts
export const countMemoryItems: Query<CountMemoryItemsQuery, number> = async (ctx: DbContext, query: { memoryId: string; }) => {...}
```

### `fetchTranslationsForMemory`

```ts
export const fetchTranslationsForMemory: Query<
  FetchTranslationsForMemoryQuery,
  TranslationForMemoryRow[]
> = async (ctx: DbContext, query: { translationIds: number[]; }) => {...}
```

### `getMemory`

```ts
export const getMemory: Query<
  GetMemoryQuery,
  typeof memory.$inferSelect | null
> = async (ctx: DbContext, query: { memoryId: string; }) => {...}
```

### `getSearchMemoryChunkRange`

```ts
export const getSearchMemoryChunkRange: Query<
  GetSearchMemoryChunkRangeQuery,
  number[]
> = async (ctx: DbContext, query: { memoryIds: string[]; sourceLanguageId: string; translationLanguageId: string; }) => {...}
```

### `listAllMemories`

```ts
export const listAllMemories: Query<
  ListAllMemoriesQuery,
  Array<typeof memory.$inferSelect>
> = async (ctx: DbContext, _query: Record) => {...}
```

### `listBm25MemorySuggestions`

```ts
export const listBm25MemorySuggestions: Query<
  ListBm25MemorySuggestionsQuery,
  RawBm25MemorySuggestion[]
> = async (ctx: DbContext, query: { text: string; sourceLanguageId: string; translationLanguageId: string; memoryIds: string[]; maxAmount: number; }) => {...}
```

### `listExactMemorySuggestions`

```ts
export const listExactMemorySuggestions: Query<
  ListExactMemorySuggestionsQuery,
  RawMemorySuggestion[]
> = async (ctx: DbContext, query: { text: string; sourceLanguageId: string; translationLanguageId: string; memoryIds: string[]; maxAmount: number; }) => {...}
```

### `listTrgmMemorySuggestions`

```ts
export const listTrgmMemorySuggestions: Query<
  ListTrgmMemorySuggestionsQuery,
  RawMemorySuggestion[]
> = async (ctx: DbContext, query: { text: string; sourceLanguageId: string; translationLanguageId: string; memoryIds: string[]; minSimilarity: number; maxAmount: number; }) => {...}
```

### `listMemoriesByCreator`

```ts
export const listMemoriesByCreator: Query<
  ListMemoriesByCreatorQuery,
  ListMemoriesByCreatorResult
> = async (ctx: DbContext, query: { creatorId: string; pageIndex?: number | undefined; pageSize?: number | undefined; }) => {...}
```

### `listMemoryIdsByProject`

```ts
export const listMemoryIdsByProject: Query<
  ListMemoryIdsByProjectQuery,
  string[]
> = async (ctx: DbContext, query: { projectId: string; }) => {...}
```

### `listMemoryItemIdsByElement`

```ts
/**
 * List all memory item UUIDs associated with a given element.
 *
 * @param ctx - Database query context
 * @param query - Query parameters (elementId)
 *
 * @returns Array of memoryItem.memoryId UUID strings
 */
export const listMemoryItemIdsByElement: Query<
  ListMemoryItemIdsByElementQuery,
  string[]
> = async (ctx: DbContext, query: { elementId: number; }) => {...}
```

### `listMemorySuggestionsByChunkIds`

```ts
export const listMemorySuggestionsByChunkIds: Query<
  ListMemorySuggestionsByChunkIdsQuery,
  MemorySuggestionCandidateRow[]
> = async (ctx: DbContext, query: { searchedChunkIds: number[]; memoryIds: string[]; maxAmount: number; sourceLanguageId: string; translationLanguageId: string; }) => {...}
```

### `listOwnedMemories`

```ts
export const listOwnedMemories: Query<
  ListOwnedMemoriesQuery,
  Array<typeof memory.$inferSelect>
> = async (ctx: DbContext, query: { creatorId: string; }) => {...}
```

### `listProjectMemories`

```ts
export const listProjectMemories: Query<
  ListProjectMemoriesQuery,
  Array<typeof memory.$inferSelect>
> = async (ctx: DbContext, query: { projectId: string; }) => {...}
```

### `listTemplateMemorySuggestions`

```ts
/**
 * Query `MemoryRecallVariant` by direct equality match on `meta->>'template'`.
 *
 * This bypasses pg_trgm similarity entirely, making it suitable for
 * template-based recall where semantically-equivalent placeholder forms
 * (e.g. "1.20" → "1.21" → "{NUM_0}.{NUM_1}") would score too low under
 * trigram similarity to surface via the variant channel.
 *
 * The template string is stored in the variant's `meta` field during variant
 * building (`buildMemoryRecallVariantsOp`), keyed as `"template"`.
 */
export const listTemplateMemorySuggestions: Query<
  ListTemplateMemorySuggestionsQuery,
  RawMemorySuggestion[]
> = async (ctx: DbContext, query: { sourceTemplate: string; sourceLanguageId: string; translationLanguageId: string; memoryIds: string[]; maxAmount: number; }) => {...}
```

### `listVariantMemorySuggestions`

```ts
/**
 * Query `MemoryRecallVariant` by trigram similarity on `normalizedText`,
 * then fetch the full memory item details.
 *
 * This covers the morphological recall channel for memory items:
 * - fragment recall (partial surface match)
 * - lemma recall (normalized token join)
 * - template recall (TOKEN_TEMPLATE variant)
 *
 * Results are returned as `RawMemorySuggestion[]` so they are directly
 * compatible with the existing `streamSearchMemoryOp` dedup pipeline.
 */
export const listVariantMemorySuggestions: Query<
  ListVariantMemorySuggestionsQuery,
  RawMemorySuggestion[]
> = async (ctx: DbContext, query: { text: string; normalizedText: string; sourceLanguageId: string; translationLanguageId: string; memoryIds: string[]; minSimilarity: number; maxAmount: number; }) => {...}
```

### packages/domain/src/queries/notification

### `countUnread`

```ts
/**
 * Count unread notifications.
 */
export const countUnread: Query<CountUnreadQuery, number> = async (ctx: DbContext, query: { userId: string; }) => {...}
```

### `getEnabledChannels`

```ts
/**
 * Get enabled channels for a user's message category. Falls back to `["IN_APP"]`.
 */
export const getEnabledChannels: Query<
  GetEnabledChannelsQuery,
  MessageChannel[]
> = async (ctx: DbContext, query: { userId: string; category: "PROJECT" | "TRANSLATION" | "SYSTEM" | "COMMENT_REPLY" | "QA"; }) => {...}
```

### `getNotification`

```ts
/**
 * Get a single notification by ID (restricted to the owner).
 */
export const getNotification: Query<
  GetNotificationQuery,
  typeof notification.$inferSelect | null
> = async (ctx: DbContext, query: { notificationId: number; userId: string; }) => {...}
```

### `listNotifications`

```ts
/**
 * Query paginated notifications.
 */
export const listNotifications: Query<
  ListNotificationsQuery,
  (typeof notification.$inferSelect)[]
> = async (ctx: DbContext, query: { userId: string; pageIndex: number; pageSize: number; statusFilter?: "UNREAD" | "READ" | "ARCHIVED" | undefined; }) => {...}
```

### `listPreferences`

```ts
/**
 * List all message preferences for a user.
 */
export const listPreferences: Query<
  ListPreferencesQuery,
  (typeof userMessagePreference.$inferSelect)[]
> = async (ctx: DbContext, query: { userId: string; }) => {...}
```

### packages/domain/src/queries/permission

### `getSubjectPermissionTuples`

```ts
export const getSubjectPermissionTuples: Query<
  GetSubjectPermissionTuplesQuery,
  SubjectPermissionTupleRow[]
> = async (ctx: DbContext, query: { subjectType: "user" | "role" | "agent"; subjectId: string; objectType: "system" | "project" | "content_node" | "content_relation" | "context_evidence" | "context_profile" | "element" | "glossary" | "memory" | "term" | "translation" | "comment" | "plugin" | "setting" | "task" | "agent_definition" | "user"; objectId: string; }) => {...}
```

### `listPermissionObjects`

```ts
export const listPermissionObjects: Query<
  ListPermissionObjectsQuery,
  PermissionObjectRow[]
> = async (ctx: DbContext, query: { subjectType: "user" | "role" | "agent"; subjectId: string; objectType: "system" | "project" | "content_node" | "content_relation" | "context_evidence" | "context_profile" | "element" | "glossary" | "memory" | "term" | "translation" | "comment" | "plugin" | "setting" | "task" | "agent_definition" | "user"; filterRelations?: ("superadmin" | "admin" | "owner" | "editor" | "viewer" | "member" | "direct_editor" | "isolation_forced")[] | undefined; }) => {...}
```

### `listPermissionSubjects`

```ts
export const listPermissionSubjects: Query<
  ListPermissionSubjectsQuery,
  PermissionSubjectRow[]
> = async (ctx: DbContext, query: { objectType: "system" | "project" | "content_node" | "content_relation" | "context_evidence" | "context_profile" | "element" | "glossary" | "memory" | "term" | "translation" | "comment" | "plugin" | "setting" | "task" | "agent_definition" | "user"; objectId: string; filterRelation?: "superadmin" | "admin" | "owner" | "editor" | "viewer" | "member" | "direct_editor" | "isolation_forced" | undefined; }) => {...}
```

### `loadUserSystemRoles`

```ts
/**
 * 加载用户的系统级角色（system object 上的权限元组）。
 * 返回用户对 system:* 持有的所有 relation 列表。
 */
export const loadUserSystemRoles: Query<
  LoadUserSystemRolesQuery,
  UserSystemRole[]
> = async (ctx: DbContext, query: { userId: string; }) => {...}
```

### packages/domain/src/queries/plugin

### `checkServiceReferences`

```ts
/**
 * Check if a plugin service is referenced by any entity (mfaProvider / blob / chunk).
 *
 * @returns `true` if at least one reference exists (service must be kept), `false` if safe to delete.
 */
export const checkServiceReferences: Query<
  CheckServiceReferencesQuery,
  boolean
> = async (ctx: DbContext, query: { serviceDbId: number; }) => {...}
```

### `getPluginConfigInstanceByInstallation`

```ts
export const getPluginConfigInstanceByInstallation: Query<
  GetPluginConfigInstanceByInstallationQuery,
  PluginConfigInstanceData | null
> = async (ctx: DbContext, query: { pluginId: string; scopeType: "GLOBAL" | "PROJECT" | "USER"; scopeId: string; }) => {...}
```

### `getPluginConfigInstance`

```ts
export const getPluginConfigInstance: Query<
  GetPluginConfigInstanceQuery,
  typeof pluginConfigInstance.$inferSelect | null
> = async (ctx: DbContext, query: { pluginId: string; scopeType: "GLOBAL" | "PROJECT" | "USER"; scopeId: string; }) => {...}
```

### `getPluginConfig`

```ts
export const getPluginConfig: Query<
  GetPluginConfigQuery,
  typeof pluginConfig.$inferSelect | null
> = async (ctx: DbContext, query: { pluginId: string; }) => {...}
```

### `getPluginInstallation`

```ts
export const getPluginInstallation: Query<
  GetPluginInstallationQuery,
  { id: number } | null
> = async (ctx: DbContext, query: { pluginId: string; scopeType: "GLOBAL" | "PROJECT" | "USER"; scopeId: string; }) => {...}
```

### `getPluginServiceById`

```ts
export const getPluginServiceById: Query<
  GetPluginServiceByIdQuery,
  PluginServiceIdentity | null
> = async (ctx: DbContext, query: { serviceDbId: number; serviceType: "AUTH_FACTOR" | "STORAGE_PROVIDER" | "FILE_IMPORTER" | "FILE_EXPORTER" | "TRANSLATION_ADVISOR" | "TEXT_VECTORIZER" | "VECTOR_STORAGE" | "QA_CHECKER" | "TOKENIZER" | "LLM_PROVIDER" | "RERANK_PROVIDER" | "AGENT_TOOL_PROVIDER" | "AGENT_CONTEXT_PROVIDER" | "NLP_WORD_SEGMENTER" | "EMAIL_PROVIDER"; }) => {...}
```

### `getPluginServiceByType`

```ts
export const getPluginServiceByType: Query<
  GetPluginServiceByTypeQuery,
  typeof pluginService.$inferSelect | null
> = async (ctx: DbContext, query: { serviceType: string; }) => {...}
```

### `getPlugin`

```ts
export const getPlugin: Query<
  GetPluginQuery,
  typeof plugin.$inferSelect | null
> = async (ctx: DbContext, query: { pluginId: string; }) => {...}
```

### `isPluginInstalled`

```ts
export const isPluginInstalled: Query<IsPluginInstalledQuery, boolean> = async (ctx: DbContext, query: { pluginId: string; scopeType: "GLOBAL" | "PROJECT" | "USER"; scopeId: string; }) => {...}
```

### `listInstalledPlugins`

```ts
export const listInstalledPlugins: Query<
  ListInstalledPluginsQuery,
  { pluginId: string }[]
> = async (ctx: DbContext, query: { scopeType: "GLOBAL" | "PROJECT" | "USER"; scopeId: string; }) => {...}
```

### `listInstalledServicesByType`

```ts
export const listInstalledServicesByType: Query<
  ListInstalledServicesByTypeQuery,
  InstalledServiceRecord[]
> = async (ctx: DbContext, query: { serviceType: "AUTH_FACTOR" | "STORAGE_PROVIDER" | "FILE_IMPORTER" | "FILE_EXPORTER" | "TRANSLATION_ADVISOR" | "TEXT_VECTORIZER" | "VECTOR_STORAGE" | "QA_CHECKER" | "TOKENIZER" | "LLM_PROVIDER" | "RERANK_PROVIDER" | "AGENT_TOOL_PROVIDER" | "AGENT_CONTEXT_PROVIDER" | "NLP_WORD_SEGMENTER" | "EMAIL_PROVIDER"; scopeType: "GLOBAL" | "PROJECT" | "USER"; scopeId: string; }) => {...}
```

### `listPluginServiceIdsByType`

```ts
export const listPluginServiceIdsByType: Query<
  ListPluginServiceIdsByTypeQuery,
  string[]
> = async (ctx: DbContext, query: { serviceType: "AUTH_FACTOR" | "STORAGE_PROVIDER" | "FILE_IMPORTER" | "FILE_EXPORTER" | "TRANSLATION_ADVISOR" | "TEXT_VECTORIZER" | "VECTOR_STORAGE" | "QA_CHECKER" | "TOKENIZER" | "LLM_PROVIDER" | "RERANK_PROVIDER" | "AGENT_TOOL_PROVIDER" | "AGENT_CONTEXT_PROVIDER" | "NLP_WORD_SEGMENTER" | "EMAIL_PROVIDER"; }) => {...}
```

### `listPluginServicesForInstallation`

```ts
export const listPluginServicesForInstallation: Query<
  ListPluginServicesForInstallationQuery,
  PluginServiceRecord[]
> = async (ctx: DbContext, query: { pluginId: string; scopeType: "GLOBAL" | "PROJECT" | "USER"; scopeId: string; }) => {...}
```

### `listPluginServices`

```ts
export const listPluginServices: Query<
  ListPluginServicesQuery,
  PluginServiceDbRecord[]
> = async (ctx: DbContext, query: { pluginInstallationId: number; }) => {...}
```

### `listPlugins`

```ts
export const listPlugins: Query<
  ListPluginsQuery,
  (typeof plugin.$inferSelect)[]
> = async (ctx: DbContext) => {...}
```

### packages/domain/src/queries/project

### `countProjectElements`

```ts
/**
 * Count all translatable elements in a project matching the given filters.
 */
export const countProjectElements: Query<
  CountProjectElementsQuery,
  number
> = async (ctx: DbContext, query: { projectId: string; isApproved?: boolean | undefined; isTranslated?: boolean | undefined; languageId?: string | undefined; }) => {...}
```

### `getProjectTargetLanguages`

```ts
export const getProjectTargetLanguages: Query<
  GetProjectTargetLanguagesQuery,
  Array<typeof language.$inferSelect>
> = async (ctx: DbContext, query: { projectId: string; }) => {...}
```

### `getProject`

```ts
export const getProject: Query<
  GetProjectQuery,
  typeof project.$inferSelect | null
> = async (ctx: DbContext, query: { projectId: string; }) => {...}
```

### `listOwnedProjects`

```ts
export const listOwnedProjects: Query<
  ListOwnedProjectsQuery,
  Array<typeof project.$inferSelect>
> = async (ctx: DbContext, query: { creatorId: string; }) => {...}
```

### `listProjectsByCreator`

```ts
export const listProjectsByCreator: Query<
  ListProjectsByCreatorQuery,
  ListProjectsByCreatorResult
> = async (ctx: DbContext, query: { creatorId: string; pageIndex?: number | undefined; pageSize?: number | undefined; }) => {...}
```

### packages/domain/src/queries/project-setting

### `getProjectSettings`

```ts
export const getProjectSettings: Query<
  GetProjectSettingsQuery,
  z.infer<typeof ProjectSettingPayloadSchema>
> = async (ctx: DbContext, query: { projectId: string; }) => {...}
```

### packages/domain/src/queries/pull-request

### `findOpenAutoTranslatePR`

```ts
/**
 * Find the currently open AUTO_TRANSLATE PR for the given language.
 */
export const findOpenAutoTranslatePR: Query<
  FindOpenAutoTranslatePRQuery,
  OpenAutoTranslatePR | null
> = async (ctx: DbContext, query: { projectId: string; languageId: string; }) => {...}
```

### `getPRByNumber`

```ts
/**
 * Get a PR by (projectId, number).
 */
export const getPRByNumber: Query<
  GetPRByNumberQuery,
  typeof pullRequest.$inferSelect | null
> = async (ctx: DbContext, query: { projectId: string; number: number; }) => {...}
```

### `getPRDiff`

```ts
/**
 * Get the changeset entries (diff) for the branch associated with the PR.
 */
export const getPRDiff: Query<
  GetPRDiffQuery,
  (typeof changesetEntry.$inferSelect)[]
> = async (ctx: DbContext, query: { prId: number; entityType?: "project" | "content_node" | "content_relation" | "context_evidence" | "context_profile" | "element" | "term" | "translation" | "comment" | "auto_translation" | "content_relation_type" | "scope_binding" | "semantic_diff" | "comment_reaction" | "term_concept" | "memory_item" | "project_settings" | "project_member" | "project_attributes" | "issue" | undefined; entityId?: string | undefined; limit?: number | undefined; }) => {...}
```

### `getPR`

```ts
/**
 * Get a PR by externalId.
 */
export const getPR: Query<
  GetPRQuery,
  typeof pullRequest.$inferSelect | null
> = async (ctx: DbContext, query: { id: string; }) => {...}
```

### `listPRs`

```ts
/**
 * List PRs in a project with optional status filter and pagination.
 */
export const listPRs: Query<
  ListPRsQuery,
  (typeof pullRequest.$inferSelect)[]
> = async (ctx: DbContext, query: { projectId: string; limit: number; offset: number; status?: "OPEN" | "CLOSED" | "DRAFT" | "REVIEW" | "CHANGES_REQUESTED" | "MERGED" | undefined; type?: "MANUAL" | "AUTO_TRANSLATE" | undefined; excludeTypes?: ("MANUAL" | "AUTO_TRANSLATE")[] | undefined; search?: string | undefined; }) => {...}
```

### packages/domain/src/queries/qa

### `listQaResultItems`

```ts
export const listQaResultItems: Query<
  ListQaResultItemsQuery,
  Array<typeof qaResultItem.$inferSelect>
> = async (ctx: DbContext, query: { qaResultId: number; }) => {...}
```

### packages/domain/src/queries/qa-review

### `countQaReviewQueueItems`

```ts
/**
 * Count QA review queue items under the current editor scope plus queue filters.
 */
export const countQaReviewQueueItems: Query<
  CountQaReviewQueueItemsQuery,
  number
> = async (ctx: DbContext, input: { projectId: string; contentNodeIds: string[]; searchQuery: string; languageToId: string; statusFilter: "all" | "untranslated" | "translated" | "approved" | "unapproved"; queueFilters: { queueStatus: ("OPEN" | "SUPERSEDED" | "CLAIMED" | "BLOCKED" | "REQUEST_CHANGES" | "APPROVABLE" | "RESOLVED")[]; riskBucket: ("LOW" | "MEDIUM" | "HIGH" | "BLOCKING" | "INFO")[]; findingAction: ("BLOCK_APPROVAL" | "NEEDS_REVIEW" | "INFORMATIONAL" | "PASS" | "SUPPRESSED")[]; includeResolved: boolean; claimedBy?: string | undefined; }; branchId?: number | undefined; }) => {...}
```

### `getQaReviewNotificationRecipient`

```ts
/**
 * Resolve the user who should receive a QA review notification while avoiding self-notifications.
 */
export const getQaReviewNotificationRecipient: Query<
  GetQaReviewNotificationRecipientQuery,
  GetQaReviewNotificationRecipientResult
> = async (ctx: DbContext, input: { queueItemId?: number | undefined; annotationId?: number | undefined; suggestionId?: number | undefined; triggererId?: string | undefined; }) => {...}
```

### `getQaReviewQueueItemProject`

```ts
/**
 * Get the owning project for a QA review queue item.
 */
export const getQaReviewQueueItemProject: Query<
  { queueItemId: number },
  { projectId: string } | null
> = async (ctx: DbContext, input: { queueItemId: number; }) => {...}
```

### `getQaReviewAnnotationProject`

```ts
/**
 * Get the owning project for a QA review annotation.
 */
export const getQaReviewAnnotationProject: Query<
  { annotationId: number },
  { projectId: string } | null
> = async (ctx: DbContext, input: { annotationId: number; }) => {...}
```

### `getQaReviewSuggestionProject`

```ts
/**
 * Get the owning project for a QA review suggestion.
 */
export const getQaReviewSuggestionProject: Query<
  { suggestionId: number },
  { projectId: string } | null
> = async (ctx: DbContext, input: { suggestionId: number; }) => {...}
```

### `getQaReviewQueueItemDetail`

```ts
/**
 * Get a single QA review queue item detail including source/candidate/approved translations and related findings/annotations/suggestions/decisions.
 */
export const getQaReviewQueueItemDetail: Query<
  GetQaReviewQueueItemDetailQuery,
  QaReviewQueueItemDetail | null
> = async (ctx: DbContext, input: { queueItemId: number; }) => {...}
```

### `getQaReviewSuggestion`

```ts
/**
 * Fetch a single QA review suggestion by ID.
 */
export const getQaReviewSuggestion: Query<
  GetQaReviewSuggestionQuery,
  typeof qaReviewSuggestion.$inferSelect | null
> = async (ctx: DbContext, input: { suggestionId: number; }) => {...}
```

### `listQaReviewAnnotations`

```ts
/**
 * List annotations under a queue item, hiding hidden annotations by default.
 */
export const listQaReviewAnnotations: Query<
  ListQaReviewAnnotationsQuery,
  Array<typeof qaReviewAnnotation.$inferSelect>
> = async (ctx: DbContext, input: { queueItemId: number; includeHidden: boolean; }) => {...}
```

### `listQaReviewFindings`

```ts
/**
 * List QA review findings for a queue item, hiding suppressed/superseded entries by default.
 */
export const listQaReviewFindings: Query<
  ListQaReviewFindingsQuery,
  Array<typeof qaReviewFinding.$inferSelect>
> = async (ctx: DbContext, input: { queueItemId: number; includeSuppressed: boolean; }) => {...}
```

### `buildQaReviewQueueRowsSql`

```ts
export const buildQaReviewQueueRowsSql = (input: ListQaReviewQueueItemsQuery): SQL<unknown>
```

### `listQaReviewQueueItems`

```ts
/**
 * List QA review queue items with pagination using the shared editor scope and queue filters.
 */
export const listQaReviewQueueItems: Query<
  ListQaReviewQueueItemsQuery,
  QaReviewQueueListItem[]
> = async (ctx: DbContext, input: { projectId: string; languageToId: string; contentNodeIds: string[]; searchQuery: string; statusFilter: "all" | "untranslated" | "translated" | "approved" | "unapproved"; pageSize: number; page: number; queueFilters: { queueStatus: ("OPEN" | "SUPERSEDED" | "CLAIMED" | "BLOCKED" | "REQUEST_CHANGES" | "APPROVABLE" | "RESOLVED")[]; riskBucket: ("LOW" | "MEDIUM" | "HIGH" | "BLOCKING" | "INFO")[]; findingAction: ("BLOCK_APPROVAL" | "NEEDS_REVIEW" | "INFORMATIONAL" | "PASS" | "SUPPRESSED")[]; includeResolved: boolean; claimedBy?: string | undefined; }; branchId?: number | undefined; }) => {...}
```

### `resolveQaReviewProfile`

```ts
/**
 * Resolve the most specific QA review profile for the given project/language/content-node/branch scope.
 */
export const resolveQaReviewProfile: Query<
  ResolveQaReviewProfileQuery,
  ResolveQaReviewProfileResult
> = async (ctx: DbContext, input: { projectId: string; languageId: string; contentNodeId?: string | null | undefined; branchId?: number | null | undefined; }) => {...}
```

### packages/domain/src/queries/session

### `listSessionsByUser`

```ts
export const listSessionsByUser: Query<
  ListSessionsByUserQuery,
  SessionRecordRow[]
> = async (ctx: DbContext, query: ListSessionsByUserQuery) => {...}
```

### packages/domain/src/queries/setting

### `getSetting`

```ts
export const getSetting: Query<GetSettingQuery, JSONType | null> = async (ctx: DbContext, query: { key: string; }) => {...}
```

### packages/domain/src/queries/string

### `countVectorizedStrings`

```ts
export const countVectorizedStrings: Query<
  CountVectorizedStringsQuery,
  number
> = async (ctx: DbContext, _query: Record) => {...}
```

### `getStringByValue`

```ts
export const getStringByValue: Query<
  GetStringByValueQuery,
  typeof vectorizedString.$inferSelect | null
> = async (ctx: DbContext, query: { value: string; languageId: string; }) => {...}
```

### `getVectorizedString`

```ts
export const getVectorizedString: Query<
  GetVectorizedStringQuery,
  typeof vectorizedString.$inferSelect | null
> = async (ctx: DbContext, query: { stringId: number; }) => {...}
```

### `listAllVectorizedStrings`

```ts
export const listAllVectorizedStrings: Query<
  ListAllVectorizedStringsQuery,
  Array<typeof vectorizedString.$inferSelect>
> = async (ctx: DbContext, _: Record) => {...}
```

### `listChunksByStringIds`

```ts
export const listChunksByStringIds: Query<
  ListChunksByStringIdsQuery,
  Array<typeof chunk.$inferSelect>
> = async (ctx: DbContext, query: { stringIds: number[]; }) => {...}
```

### `listVectorizedStringsById`

```ts
export const listVectorizedStringsById: Query<
  ListVectorizedStringsByIdQuery,
  Array<typeof vectorizedString.$inferSelect>
> = async (ctx: DbContext, query: { stringIds: number[]; }) => {...}
```

### packages/domain/src/queries/translation

### `buildTranslationStatusConditions`

```ts
export const buildTranslationStatusConditions = (db: DbHandle, isTranslated?: boolean, isApproved?: boolean, languageId?: string): SQL<unknown>[]
```

### `getSelfTranslationVote`

```ts
export const getSelfTranslationVote: Query<
  GetSelfTranslationVoteQuery,
  typeof translationVote.$inferSelect | null
> = async (ctx: DbContext, query: { translationId: number; voterId: string; }) => {...}
```

### `getTranslationCreatedEventContext`

```ts
/**
 * Resolve project, element, and primary content-node context for translation ids.
 *
 * @param ctx - Query context
 * @param query - Translation-id query input
 *
 * @returns Translation-created event context grouped by project
 */
export const getTranslationCreatedEventContext: Query<
  GetTranslationCreatedEventContextQuery,
  TranslationCreatedEventContext[]
> = async (ctx: DbContext, query: { translationIds: number[]; }) => {...}
```

### `getTranslationQaContext`

```ts
/**
 * Fetch the context required to run translation QA (translation text, source text, language info).
 */
export const getTranslationQaContext: Query<
  GetTranslationQaContextQuery,
  TranslationQaContext | null
> = async (ctx: DbContext, query: { translationId: number; }) => {...}
```

### `getTranslationVoteTotal`

```ts
export const getTranslationVoteTotal: Query<
  GetTranslationVoteTotalQuery,
  number
> = async (ctx: DbContext, query: { translationId: number; }) => {...}
```

### `listQaResultsByTranslation`

```ts
export const listQaResultsByTranslation: Query<
  ListQaResultsByTranslationQuery,
  Array<typeof qaResult.$inferSelect>
> = async (ctx: DbContext, query: { translationId: number; }) => {...}
```

### `listTranslationsByElement`

```ts
export const listTranslationsByElement: Query<
  ListTranslationsByElementQuery,
  TranslationListItem[]
> = async (ctx: DbContext, query: { elementId: number; languageId: string; }) => {...}
```

### `listTranslationsByIds`

```ts
export const listTranslationsByIds: Query<
  ListTranslationsByIdsQuery,
  TranslationWithVoteAndText[]
> = async (ctx: DbContext, query: { translationIds: number[]; }) => {...}
```

### packages/domain/src/queries/user

### `getFirstRegisteredUser`

```ts
export const getFirstRegisteredUser: Query<
  Record<string, never>,
  { id: string } | null
> = async (ctx: DbContext) => {...}
```

### `getUserAvatarFile`

```ts
export const getUserAvatarFile: Query<
  GetUserAvatarFileQuery,
  UserAvatarFileRef | null
> = async (ctx: DbContext, query: { userId: string; }) => {...}
```

### `getUserEmail`

```ts
/**
 * Get a user's email address by user ID.
 */
export const getUserEmail: Query<GetUserEmailQuery, string | null> = async (ctx: DbContext, query: { userId: string; }) => {...}
```

### `getUser`

```ts
export const getUser: Query<
  GetUserQuery,
  typeof user.$inferSelect | null
> = async (ctx: DbContext, query: { userId: string; }) => {...}
```

### packages/domain/src/queries/vector

### `getChunkVectorStorageId`

```ts
export const getChunkVectorStorageId: Query<
  GetChunkVectorStorageIdQuery,
  number | null
> = async (ctx: DbContext, query: { chunkId: number; }) => {...}
```

### `getChunkVectors`

```ts
export const getChunkVectors: Query<
  GetChunkVectorsQuery,
  VectorChunk[]
> = async (ctx: DbContext, query: { chunkIds: number[]; }) => {...}
```

### `listChunkVectorizationInputs`

```ts
export const listChunkVectorizationInputs: Query<
  ListChunkVectorizationInputsQuery,
  ChunkVectorizationInput[]
> = async (ctx: DbContext, query: { chunkIds: number[]; }) => {...}
```

### `searchChunkCosineSimilarity`

```ts
export const searchChunkCosineSimilarity: Query<
  SearchChunkCosineSimilarityQuery,
  ChunkCosineSimilarityItem[]
> = async (ctx: DbContext, query: { vectors: number[][]; chunkIdRange: number[]; minSimilarity: number; maxAmount: number; }) => {...}
```

### packages/domain/src/testing

### `setupTestDB`

```ts
export const setupTestDB = async (): Promise<TestDB>
```

## Type Index

* `CacheStore` (interface) — 缓存存储接口

* `SessionStore` (interface) — 会话存储接口（基于 Hash 结构）

* `CacheOptions` (type) — 缓存配置选项

* `ProjectCapabilities` (type)

* `TranslationCapabilities` (type)

* `SettingCapabilities` (type)

* `AuthCapabilities` (type)

* `VectorCapabilities` (type)

* `LanguageCapabilities` (type)

* `UserCapabilities` (type)

* `CommentCapabilities` (type)

* `AgentCapabilities` (type)

* `GlossaryCapabilities` (type)

* `MemoryCapabilities` (type)

* `PluginCapabilities` (type)

* `CompleteAgentSessionCommand` (type)

* `CreateAgentDefinitionCommand` (type)

* `CreateAgentRunCommand` (type)

* `CreateAgentRunResult` (type)

* `CreateAgentSessionCommand` (type)

* `DeleteAgentDefinitionCommand` (type)

* `FinishAgentRunCommand` (type)

* `SaveAgentEventCommand` (type)

* `SaveAgentExternalOutputCommand` (type)

* `SaveAgentRunMetadataCommand` (type)

* `SaveAgentRunSnapshotCommand` (type)

* `UpdateAgentDefinitionCommand` (type)

* `CreateApiKeyCommand` (interface)

* `RevokeApiKeyCommand` (interface)

* `UpdateApiKeyLastUsedCommand` (interface)

* `CreateAccountCommand` (type)

* `CreateAccountResult` (type)

* `CreateMfaProviderCommand` (type)

* `RegisterUserWithPasswordAccountCommand` (type)

* `RegisterUserWithPasswordAccountResult` (type)

* `CreateBranchCommand` (type)

* `MarkBranchConflictedCommand` (type)

* `UpdateBranchBaseChangesetCommand` (type)

* `UpdateBranchStatusCommand` (type)

* `AddChangesetEntryCommand` (type)

* `BatchUpdateEntryBeforeCommand` (type)

* `CreateChangesetCommand` (type)

* `ReviewChangesetEntryCommand` (type)

* `ReviewChangesetCommand` (type)

* `ApplyChangesetCommand` (type)

* `UpdateEntryAsyncStatusCommand` (type)

* `UpdateChangesetAsyncStatusCommand` (type)

* `UpsertAutoTranslationEntryCommand` (type)

* `CreateCommentCommand` (type)

* `DeleteCommentReactionCommand` (type)

* `DeleteCommentCommand` (type)

* `UpsertCommentReactionCommand` (type)

* `ApplyContentGraphEnvelopeInput` (type)

* `AppliedGraphEnvelope` (type)

* `BulkUpdatePrimaryRelationOrderCommand` (type)

* `CreateContentNodeUnderParentCommand` (type)

* `CreateRootContentNodeCommand` (type)

* `DeleteContentNodeCommand` (type)

* `EnsureCoreRelationTypesCommand` (type)

* `InsertSemanticDiffEntryInput` (type)

* `InsertSemanticDiffEntryOutput` (type)

* `PersistContentGraphAttachmentsInput` (type)

* `PersistContentGraphAttachmentsOutput` (type)

* `UpdatePrimaryElementRelationsForDiffCommand` (type)

* `AddElementContextEvidenceCommand` (type) — Command input for adding element context evidence.

* `AddElementContextEvidenceCommandInput` (type)

* `EnsureDefaultContextProfileCommand` (type)

* `ParseAndSaveCrossReferencesCommand` (type)

* `BulkUpdateElementsForDiffCommand` (type)

* `BulkUpdateElementsForDiffCommandInput` (type)

* `CreateElementsCommand` (type)

* `DeleteElementsByIdsCommand` (type)

* `CreateBlobCommand` (type)

* `CreateFileCommand` (type)

* `CreateOrReferenceBlobAndFileCommand` (type)

* `CreateOrReferenceBlobAndFileResult` (type)

* `CreateBlobAndFileCommand` (type)

* `CreateBlobAndFileResult` (type)

* `ActivateFileCommand` (type)

* `RollbackBlobAndFileCommand` (type)

* `DeleteBlobAndFileCommand` (type)

* `FinalizePresignedFileCommand` (type)

* `FinalizePresignedFileResult` (type)

* `AddGlossaryTermToConceptCommand` (type)

* `AddGlossaryTermToConceptResult` (type)

* `CreateGlossaryConceptSubjectCommand` (type)

* `CreateGlossaryConceptCommand` (type)

* `CreateGlossaryTermsCommand` (type)

* `CreateGlossaryTermsResult` (type)

* `CreateGlossaryCommand` (type)

* `DeleteGlossaryTermCommand` (type)

* `DeleteGlossaryTermResult` (type)

* `ReplaceTermRecallVariantsCommand` (type)

* `SetConceptStringIdCommand` (type)

* `SetConceptStringIdResult` (type)

* `UpdateGlossaryConceptCommand` (type)

* `UpdateGlossaryConceptResult` (type)

* `CreateIssueCommentCommand` (type)

* `CreateThreadCommand` (type)

* `DeleteIssueCommentCommand` (type)

* `ResolveThreadCommand` (type)

* `UpdateIssueCommentCommand` (type)

* `AssignIssueCommand` (type)

* `ClaimIssueCommand` (type)

* `ClaimIssueResult` (type)

* `CloseIssueCommand` (type)

* `CreateIssueCommand` (type)

* `ReopenIssueCommand` (type)

* `UpdateIssueCommand` (type)

* `EnsureLanguagesCommand` (type)

* `InsertLoginAttemptCommand` (interface)

* `CreateMemoryItemsCommand` (type)

* `CreatedMemoryItemRow` (type)

* `CreateMemoryCommand` (type)

* `ReplaceMemoryRecallVariantsCommand` (type)

* `CreateNotificationCommand` (type)

* `MarkAllNotificationsReadCommand` (type)

* `MarkNotificationReadCommand` (type)

* `UpsertMessagePreferenceCommand` (type)

* `GrantFirstUserSuperadminCommand` (type)

* `GrantPermissionTupleCommand` (type)

* `AuditLogEntry` (type)

* `InsertAuditLogsCommand` (type)

* `RevokePermissionTupleCommand` (type)

* `SeedSystemRolesCommand` (type)

* `DeletePluginServicesCommand` (type)

* `InstallPluginCommand` (type)

* `RegisterPluginDefinitionCommand` (type)

* `SyncPluginServicesCommand` (type)

* `UninstallPluginCommand` (type)

* `UpdatePluginConfigInstanceValueIfUnchangedCommand` (type) — Command payload for updating a config instance value only when the version is unchanged.

* `UpdatePluginConfigInstanceValueCommand` (type)

* `UpsertPluginConfigInstanceCommand` (type)

* `UpdateProjectSettingsCommand` (type)

* `AddProjectTargetLanguagesCommand` (type)

* `CreateProjectCommand` (type)

* `DeleteProjectCommand` (type)

* `LinkProjectGlossariesCommand` (type)

* `LinkProjectMemoriesCommand` (type)

* `UnlinkProjectGlossariesCommand` (type)

* `UnlinkProjectMemoriesCommand` (type)

* `UpdateProjectFeaturesCommand` (type)

* `UpdateProjectCommand` (type)

* `ClosePRCommand` (type)

* `CreatePRCommand` (type)

* `MergePRCommand` (type)

* `ReviewDecision` (type)

* `SubmitReviewCommand` (type)

* `UpdatePRStatusCommand` (type)

* `UpdatePRCommand` (type)

* `ClaimQaReviewQueueItemCommand` (type)

* `CreateQaReviewAnnotationCommand` (type)

* `CreateQaReviewRunWithFindingsCommand` (type)

* `CreateQaReviewRunWithFindingsResult` (type)

* `CreateQaReviewSuggestionCommand` (type)

* `MarkQaReviewSuggestionAppliedCommand` (type)

* `MaterializeQaReviewQueueItemCommand` (type)

* `MaterializeQaReviewQueueItemResult` (type)

* `RejectQaReviewSuggestionCommand` (type)

* `SubmitQaReviewDecisionCommandInput` (type)

* `TransitionQaReviewAnnotationCommand` (type)

* `CreateQaResultItemsCommand` (type)

* `CreateQaResultWithItemsCommand` (type)

* `CreateQaResultWithItemsResult` (type)

* `CreateQaResultCommand` (type)

* `AllocateNumberCommand` (type)

* `CreateSessionRecordCommand` (interface)

* `RevokeSessionRecordCommand` (interface)

* `SetSettingCommand` (type)

* `AttachChunkSetToStringCommand` (type)

* `CreateChunkSetCommand` (type)

* `CreateVectorizedStringsCommand` (type)

* `UpdateVectorizedStringStatusCommand` (type)

* `ApproveTranslationCommand` (type)

* `AutoApproveContentNodeTranslationsCommand` (type)

* `AutoApproveOperationScopeTranslationsCommand` (type)

* `CreateProjectTranslationSnapshotCommand` (type)

* `CreateTranslationsCommand` (type)

* `DeleteTranslationCommand` (type)

* `UnapproveTranslationCommand` (type)

* `UpsertTranslationVoteCommand` (type)

* `CreateUserCommand` (type)

* `UpdateUserAvatarCommand` (type)

* `UpdateUserCommand` (type)

* `BulkUpdateChunkVectorMetadataCommand` (type)

* `BulkUpdateChunkVectorMetadataResult` (type)

* `CreateVectorizedChunksCommand` (type)

* `CreateVectorizedChunksResult` (type)

* `EnsureVectorStorageSchemaCommand` (type)

* `UpdateVectorDimensionCommand` (type)

* `UpsertChunkVectorsCommand` (type)

* `DomainEventBus` (type)

* `DomainEventMap` (type)

* `DomainEvent` (type)

* `DomainEventType` (type)

* `EventCollector` (type)

* `ExecutorContext` (type)

* `FindAgentDefinitionByDefinitionIdAndScopeQuery` (type)

* `FindAgentDefinitionByNameAndScopeQuery` (type)

* `FindAgentRunByDeduplicationKeyQuery` (type)

* `GetAgentDefinitionByInternalIdQuery` (type)

* `GetAgentDefinitionQuery` (type)

* `GetAgentRunByInternalIdQuery` (type)

* `AgentRunByInternalId` (type) — Query an agent run and its blackboard snapshot by internal ID.

* `GetAgentRunInternalIdQuery` (type)

* `GetAgentRunRuntimeStateQuery` (type)

* `AgentRunRuntimeState` (type)

* `GetAgentSessionByExternalIdQuery` (type)

* `AgentSessionByExternalId` (type)

* `GetAgentSessionRuntimeStateQuery` (type)

* `AgentSessionRuntimeState` (type)

* `GetLatestCompletedRunBlackboardQuery` (type)

* `LatestCompletedRunBlackboard` (type)

* `GetRunNodeEventsQuery` (type)

* `RunNodeEventRow` (type)

* `ListAgentDefinitionsQuery` (type)

* `ListAgentEventsQuery` (type)

* `AgentEventRow` (type)

* `AgentRunSnapshotBySessionRow` (type)

* `ListAgentSessionsQuery` (type)

* `ListProjectRunsQuery` (type)

* `ProjectRunRow` (type)

* `LoadAgentExternalOutputByIdempotencyQuery` (type)

* `AgentExternalOutputRow` (type)

* `LoadAgentRunMetadataQuery` (type)

* `AgentRunMetadataRow` (type)

* `LoadAgentRunSnapshotQuery` (type)

* `GetApiKeyByHashQuery` (interface)

* `ApiKeyRow` (interface)

* `ListApiKeysByUserQuery` (interface)

* `FindAccountByProviderIdentityQuery` (type)

* `AccountIdentity` (type)

* `FindUserByIdentifierQuery` (type)

* `AuthUserIdentity` (type)

* `GetAccountMetaByIdentityQuery` (type)

* `GetAccountMetaByProviderAndIdentifierQuery` (type)

* `GetMfaPayloadByFactorAndUserQuery` (type)

* `GetMfaProviderByServiceAndUserQuery` (type)

* `GetBranchByIdQuery` (type)

* `GetBranchQuery` (type)

* `ListBranchesQuery` (type)

* `GetLatestBranchChangesetIdQuery` (type)

* `GetLatestMainChangesetIdQuery` (type)

* `ListBranchChangesetIdsQuery` (type)

* `ListMainEntriesSinceQuery` (type)

* `GetChangesetQuery` (type)

* `GetChangesetByExternalIdQuery` (type)

* `ListChangesetsQuery` (type)

* `GetChangesetEntriesQuery` (type)

* `ListBranchChangesetEntriesQuery` (type)

* `ListAllChunksQuery` (type)

* `GetCommentRecipientQuery` (type)

* `ListChildCommentsQuery` (type)

* `ListCommentReactionsQuery` (type)

* `ListRootCommentsQuery` (type)

* `CountContentNodeElementsQuery` (type)

* `CountContentNodeTranslationsQuery` (type)

* `ListEditorScopeElementsQuery` (type) — Type for paginated editor-scope element queries.

* `CountEditorScopeElementsQuery` (type) — Type for editor-scope element count queries.

* `GetEditorScopeFirstElementQuery` (type) — Type for fetching the first matching element in an editor scope.

* `GetEditorScopeElementPageIndexQuery` (type) — Type for editor-scope element page-index queries.

* `EditorScopeSqlInput` (type)

* `FindProjectContentNodeByLabelQuery` (type)

* `GetContentNodeBlobInfoQuery` (type)

* `ContentNodeBlobInfo` (type)

* `GetContentNodeElementPageIndexQuery` (type)

* `ElementTranslationStatus` (type)

* `GetContentNodeElementsQuery` (type)

* `ContentNodeElementRow` (type)

* `GetContentNodeFirstElementQuery` (type)

* `GetContentNodeQuery` (type)

* `GetContentRelationQuery` (type)

* `GetContextEvidenceQuery` (type)

* `GetElementTranslationStatusQuery` (type)

* `GetProjectRootContentNodeQuery` (type)

* `ListContentNodeElementIdsQuery` (type)

* `ListContentNodeElementsWithChunkIdsQuery` (type)

* `ContentNodeElementWithChunkIds` (type)

* `ListEditorScopeContentNodesQuery` (type) — Type for listing content nodes visible to an editor scope.

* `ListProjectContentNodesQuery` (type)

* `ProjectContentNodeRow` (type)

* `AssembleContextEvidenceQuery` (type)

* `GetEffectiveContextProfileQuery` (type)

* `EffectiveContextProfile` (type)

* `ListReferencesFromQuery` (type)

* `ListReferencesToQuery` (type)

* `GetElementContextsQuery` (type)

* `GetElementContextsResult` (type)

* `GetElementMetaQuery` (type)

* `GetElementProjectQuery` (type)

* `GetElementSourceLocationQuery` (type)

* `ElementSourceLocation` (type)

* `GetElementWithChunkIdsQuery` (type)

* `ElementWithChunkIds` (type)

* `GetTranslatableElementRowQuery` (type) — Type for fetching a full translatable-element row.

* `ListAllElementsQuery` (type)

* `ListCachedVectorizedStringsQuery` (type)

* `CachedVectorizedString` (type)

* `ListElementCommentsQuery` (type)

* `CommentThread` (type)

* `ListElementSourceTextsQuery` (type)

* `ElementSourceText` (type)

* `ListElementsByImporterScopeQuery` (type)

* `ElementByImporterScopeRow` (type)

* `ListElementsForDiffQuery` (type)

* `ElementForDiff` (type)

* `ListElementsWithChunkIdsByIdsQuery` (type) — Type for bulk element detail queries.

* `ElementWithChunkIdsById` (type) — Element detail with chunk metadata.

* `ListNeighborElementsQuery` (type)

* `NeighborElementRow` (type)

* `GetActiveFileBlobInfoQuery` (type)

* `ActiveFileBlobInfo` (type)

* `GetActiveFileNameQuery` (type)

* `GetBlobByKeyQuery` (type)

* `GetFileQuery` (type)

* `ListAllFilesQuery` (type)

* `CountGlossaryConceptsQuery` (type)

* `LookedUpTerm` (type) — Represents a resolved term pair (source + translation) for a given concept.
  Alias to TermMatch from
  @cat /shared for backward compatibility.

* `GetConceptRecallDetailQuery` (type)

* `ConceptTermEntry` (type)

* `ConceptRecallDetail` (type)

* `GetConceptVectorizationSnapshotQuery` (type)

* `ConceptVectorizationSnapshot` (type)

* `GetGlossaryConceptDetailQuery` (type)

* `GlossaryConceptDetail` (type)

* `GetGlossaryQuery` (type)

* `ListAllGlossariesQuery` (type)

* `ListAllTermsQuery` (type)

* `TermWithConcept` (type)

* `ListConceptSubjectsByConceptIdsQuery` (type)

* `ConceptSubjectRow` (type)

* `ListGlossariesByCreatorQuery` (type)

* `ListGlossariesByCreatorResult` (type)

* `ListGlossaryConceptSubjectsQuery` (type)

* `GlossaryConceptSubject` (type)

* `ListGlossaryConceptsQuery` (type)

* `GlossaryConceptData` (type)

* `ListGlossaryConceptsResult` (type)

* `ListGlossaryTermPairsQuery` (type)

* `GlossaryTermPairData` (type)

* `ListGlossaryTermPairsResult` (type)

* `ListLexicalTermSuggestionsQuery` (type)

* `LexicalTermSuggestion` (type)

* `ListMorphologicalTermSuggestionsQuery` (type)

* `ListOwnedGlossariesQuery` (type)

* `ListProjectGlossariesQuery` (type)

* `ListProjectGlossaryIdsQuery` (type)

* `ListSemanticTermSearchRangeQuery` (type)

* `SemanticTermSearchRangeRow` (type)

* `ListTermConceptIdsByRecallVariantsQuery` (type)

* `ListTermConceptIdsBySubjectQuery` (type)

* `ListCommentsQuery` (type)

* `ListThreadsQuery` (type)

* `GetClaimableIssueQuery` (type)

* `GetIssueByNumberQuery` (type)

* `GetIssueQuery` (type)

* `ListIssuesQuery` (type)

* `GetLanguageQuery` (type)

* `ListLanguagesQuery` (type)

* `ListLanguagesResult` (type)

* `CountRecentAttemptsQuery` (interface)

* `CountMemoryItemsQuery` (type)

* `FetchTranslationsForMemoryQuery` (type)

* `TranslationForMemoryRow` (type)

* `GetMemoryQuery` (type)

* `GetSearchMemoryChunkRangeQuery` (type)

* `ListAllMemoriesQuery` (type)

* `ListBm25MemorySuggestionsQuery` (type)

* `RawBm25MemorySuggestion` (type)

* `RawMemorySuggestion` (type)

* `ListExactMemorySuggestionsQuery` (type)

* `ListTrgmMemorySuggestionsQuery` (type)

* `ListMemoriesByCreatorQuery` (type)

* `ListMemoriesByCreatorResult` (type)

* `ListMemoryIdsByProjectQuery` (type)

* `ListMemoryItemIdsByElementQuery` (type)

* `ListMemorySuggestionsByChunkIdsQuery` (type)

* `MemorySuggestionCandidateRow` (type)

* `ListOwnedMemoriesQuery` (type)

* `ListProjectMemoriesQuery` (type)

* `ListTemplateMemorySuggestionsQuery` (type)

* `ListVariantMemorySuggestionsQuery` (type)

* `ListAllProjectsQuery` (type)

* `ListAllUsersQuery` (type)

* `CountUnreadQuery` (type)

* `GetEnabledChannelsQuery` (type)

* `GetNotificationQuery` (type)

* `ListNotificationsQuery` (type)

* `ListPreferencesQuery` (type)

* `GetSubjectPermissionTuplesQuery` (type)

* `SubjectPermissionTupleRow` (type)

* `ListPermissionObjectsQuery` (type)

* `PermissionObjectRow` (type)

* `ListPermissionSubjectsQuery` (type)

* `PermissionSubjectRow` (type)

* `LoadUserSystemRolesQuery` (type)

* `UserSystemRole` (type)

* `CheckServiceReferencesQuery` (type)

* `GetPluginConfigInstanceByInstallationQuery` (type)

* `PluginConfigInstanceData` (type)

* `GetPluginConfigInstanceQuery` (type)

* `GetPluginConfigQuery` (type)

* `GetPluginInstallationQuery` (type)

* `GetPluginServiceByIdQuery` (type)

* `PluginServiceIdentity` (type)

* `GetPluginServiceByTypeQuery` (type)

* `GetPluginQuery` (type)

* `IsPluginInstalledQuery` (type)

* `ListInstalledPluginsQuery` (type)

* `ListInstalledServicesByTypeQuery` (type)

* `InstalledServiceRecord` (type)

* `ListPluginServiceIdsByTypeQuery` (type)

* `ListPluginServicesForInstallationQuery` (type)

* `PluginServiceRecord` (type)

* `ListPluginServicesQuery` (type)

* `PluginServiceDbRecord` (type)

* `ListPluginsQuery` (type)

* `GetProjectSettingsQuery` (type)

* `CountProjectElementsQuery` (type)

* `GetProjectTargetLanguagesQuery` (type)

* `GetProjectQuery` (type)

* `ListOwnedProjectsQuery` (type)

* `ListProjectsByCreatorQuery` (type)

* `ListProjectsByCreatorResult` (type)

* `FindOpenAutoTranslatePRQuery` (type)

* `OpenAutoTranslatePR` (type)

* `GetPRByNumberQuery` (type)

* `GetPRDiffQuery` (type)

* `GetPRQuery` (type)

* `ListPRsQuery` (type)

* `CountQaReviewQueueItemsQuery` (type)

* `GetQaReviewNotificationRecipientQuery` (type)

* `GetQaReviewNotificationRecipientResult` (type)

* `GetQaReviewQueueItemDetailQuery` (type)

* `QaReviewTranslationDetail` (type)

* `QaReviewQueueItemDetail` (type)

* `GetQaReviewSuggestionQuery` (type)

* `ListQaReviewAnnotationsQuery` (type)

* `ListQaReviewFindingsQuery` (type)

* `ListQaReviewQueueItemsQuery` (type)

* `QaReviewQueueListItem` (type)

* `ResolveQaReviewProfileQuery` (type)

* `ResolveQaReviewProfileResult` (type)

* `ListQaResultItemsQuery` (type)

* `ListSessionsByUserQuery` (interface)

* `SessionRecordRow` (interface)

* `GetSettingQuery` (type)

* `CountVectorizedStringsQuery` (type)

* `GetStringByValueQuery` (type)

* `GetVectorizedStringQuery` (type)

* `ListAllVectorizedStringsQuery` (type)

* `ListChunksByStringIdsQuery` (type)

* `ListVectorizedStringsByIdQuery` (type)

* `GetSelfTranslationVoteQuery` (type)

* `GetTranslationCreatedEventContextQuery` (type)

* `TranslationCreatedEventContext` (type) — Context payload for translation-created events.

* `GetTranslationQaContextQuery` (type)

* `TranslationQaContext` (type)

* `GetTranslationVoteTotalQuery` (type)

* `ListQaResultsByTranslationQuery` (type)

* `ListTranslationsByElementQuery` (type)

* `TranslationListItem` (type)

* `ListTranslationsByIdsQuery` (type)

* `TranslationWithVoteAndText` (type)

* `GetUserAvatarFileQuery` (type)

* `UserAvatarFileRef` (type)

* `GetUserEmailQuery` (type)

* `GetUserQuery` (type)

* `GetChunkVectorStorageIdQuery` (type)

* `GetChunkVectorsQuery` (type)

* `VectorChunk` (type)

* `ListChunkVectorizationInputsQuery` (type)

* `ChunkVectorizationInput` (type)

* `SearchChunkCosineSimilarityQuery` (type)

* `ChunkCosineSimilarityItem` (type)

* `TestDB` (type)

* `DbHandle` (type)

* `DbContext` (type)

* `CommandResult` (type)

* `Query` (type)

* `Command` (type)

* `OperationContext` (type) — Cross-cutting context passed through operation chains.
  Contains a trace ID for distributed tracing, an optional abort signal,
  and an optional plugin manager instance override.
