# @cat/domain

Domain layer: CQRS Commands and Queries, core business logic

## Overview

- **Modules**: 240
- **Exported functions**: 242
- **Exported types**: 337

## Function Index

### src

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `executeCommand` | execCtx, command, input | `Promise<R>` | - |
| `executeQuery` | execCtx, query, input | `Promise<R>` | - |

### src/queries

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listAllProjects` | ctx, _query | `Promise<any>` | - |
| `listAllUsers` | ctx, _query | `Promise<any>` | - |

### src/infrastructure

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `getDbHandle` | - | `Promise<DrizzleDB>` | - |
| `getRedisHandle` | - | `Promise<RedisConnection>` | - |

### src/events

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `createEvent` | type, payload, options? | `EventOf<M, T>` | - |
| `createInProcessCollector` | bus | `EventCollector` | - |
| `domainEvent` | type, payload | `EventOf<DomainEventMap, T>` | - |

### src/commands

*No exported functions*

### src/capabilities

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `createPluginCapabilities` | execCtx, checkPermission? | `PluginCapabilities` | - |

### src/cache

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `generateCacheKey` | payload | `string` | 生成输入数据的哈希值作为缓存键 |
| `initCacheStore` | store | `void` | 初始化缓存存储 |
| `getCacheStore` | - | `CacheStore` | 获取缓存存储实例 |
| `initSessionStore` | store | `void` | 初始化会话存储 |
| `getSessionStore` | - | `SessionStore` | 获取会话存储实例 |
| `withCache` | operation, options | `(input: I) => Promise<O>` | 带缓存的高阶函数包装器
包装一个异步函数，使其自动使用缓存 |

### src/queries/user

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `getUser` | ctx, query | `Promise<unknown>` | - |
| `getUserAvatarFile` | ctx, query | `Promise<{} | null>` | - |
| `getFirstRegisteredUser` | ctx | `Promise<any>` | - |

### src/queries/vector

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `searchChunkCosineSimilarity` | ctx, query | `Promise<any>` | - |
| `getChunkVectors` | ctx, query | `Promise<any>` | - |

### src/queries/setting

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `getSetting` | ctx, query | `Promise<any>` | - |

### src/queries/translation

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listUserTranslationHistory` | ctx, query | `Promise<{ translations: any; nextCursor: any; hasMore: boolean; }>` | - |
| `listTranslationsByIds` | ctx, query | `Promise<any>` | - |
| `listTranslationsByElement` | ctx, query | `Promise<any>` | - |
| `listQaResultsByTranslation` | ctx, query | `Promise<any>` | - |
| `getTranslationVoteTotal` | ctx, query | `Promise<number>` | - |
| `getSelfTranslationVote` | ctx, query | `Promise<unknown>` | - |

### src/queries/session

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listSessionsByUser` | ctx, query | `Promise<any>` | - |

### src/queries/string

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listTranslatableStringsById` | ctx, query | `Promise<any>` | - |
| `listChunksByStringIds` | ctx, query | `Promise<any>` | - |
| `listAllTranslatableStrings` | ctx, _ | `Promise<any>` | - |
| `getTranslatableString` | ctx, query | `Promise<any>` | - |
| `getStringByValue` | ctx, query | `Promise<any>` | - |
| `countTranslatableStrings` | ctx, _query | `Promise<any>` | - |

### src/queries/qa

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listQaResultItems` | ctx, query | `Promise<any>` | - |
| `listDocumentGlossaryIds` | ctx, query | `Promise<any>` | - |
| `getTranslationQaContext` | ctx, query | `Promise<unknown>` | - |

### src/queries/project

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listProjectsByCreator` | ctx, query | `Promise<{ data: any; total: number; }>` | - |
| `listProjectDocuments` | ctx, query | `Promise<any>` | - |
| `listOwnedProjects` | ctx, query | `Promise<any>` | - |
| `getProject` | ctx, query | `Promise<unknown>` | - |
| `getProjectTargetLanguages` | ctx, query | `Promise<any>` | - |
| `countProjectElements` | ctx, query | `Promise<any>` | - |

### src/queries/permission

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `loadUserSystemRoles` | ctx, query | `Promise<any>` | 加载用户的系统级角色（system object 上的权限元组）。
返回用户对 system:* 持有的所有 relation 列表。 |
| `listPermissionSubjects` | ctx, query | `Promise<any>` | - |
| `listPermissionObjects` | ctx, query | `Promise<any>` | - |
| `getSubjectPermissionTuples` | ctx, query | `Promise<any>` | - |

### src/queries/plugin

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listPlugins` | ctx | `Promise<any>` | - |
| `listPluginServices` | ctx, query | `Promise<any>` | - |
| `listPluginServicesForInstallation` | ctx, query | `Promise<any>` | - |
| `listPluginServiceIdsByType` | ctx, query | `Promise<any>` | - |
| `listInstalledServicesByType` | ctx, query | `Promise<any>` | - |
| `listInstalledPlugins` | ctx, query | `Promise<any>` | - |
| `isPluginInstalled` | ctx, query | `Promise<boolean>` | - |
| `getPlugin` | ctx, query | `Promise<unknown>` | - |
| `getPluginServiceByType` | ctx, query | `Promise<unknown>` | - |
| `getPluginServiceById` | ctx, query | `Promise<unknown>` | - |
| `getPluginInstallation` | ctx, query | `Promise<unknown>` | - |
| `getPluginConfig` | ctx, query | `Promise<unknown>` | - |
| `getPluginConfigInstance` | ctx, query | `Promise<unknown>` | - |
| `getPluginConfigInstanceByInstallation` | ctx, query | `Promise<any>` | - |
| `checkServiceReferences` | ctx, query | `Promise<boolean>` | - |

### src/queries/memory

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listProjectMemories` | ctx, query | `Promise<any>` | - |
| `listOwnedMemories` | ctx, query | `Promise<any>` | - |
| `listMemorySuggestionsByChunkIds` | ctx, query | `Promise<any>` | - |
| `listMemoryIdsByProject` | ctx, query | `Promise<any>` | - |
| `listMemoriesByCreator` | ctx, query | `Promise<{ data: any; total: number; }>` | - |
| `listExactMemorySuggestions` | ctx, query | `Promise<any>` | - |
| `listTrgmMemorySuggestions` | ctx, query | `Promise<any>` | - |
| `listAllMemories` | ctx, _query | `Promise<any>` | - |
| `getSearchMemoryChunkRange` | ctx, query | `Promise<any[]>` | - |
| `getMemory` | ctx, query | `Promise<unknown>` | - |
| `fetchTranslationsForMemory` | ctx, query | `Promise<any>` | - |
| `countMemoryItems` | ctx, query | `Promise<any>` | - |

### src/queries/login-attempt

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `countRecentAttempts` | ctx, query | `Promise<number>` | - |

### src/queries/language

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listLanguages` | ctx, query | `Promise<{ languages: any; hasMore: boolean; }>` | - |
| `getLanguage` | ctx, query | `Promise<unknown>` | - |

### src/queries/file

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listAllFiles` | ctx, _query | `Promise<any>` | - |
| `getFile` | ctx, query | `Promise<unknown>` | - |
| `getBlobByKey` | ctx, query | `Promise<any>` | - |

### src/queries/glossary

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listTermConceptIdsBySubject` | ctx, query | `Promise<any>` | - |
| `listSemanticTermSearchRange` | ctx, query | `Promise<any>` | - |
| `listProjectGlossaryIds` | ctx, query | `Promise<any>` | - |
| `listProjectGlossaries` | ctx, query | `Promise<any>` | - |
| `listOwnedGlossaries` | ctx, query | `Promise<any>` | - |
| `listLexicalTermSuggestions` | ctx, query | `Promise<LexicalTermSuggestion[]>` | - |
| `listGlossaryTermPairs` | ctx, query | `Promise<{ data: any; total: number; }>` | - |
| `listGlossaryConcepts` | ctx, query | `Promise<{ data: any[]; total: number; }>` | - |
| `listGlossaryConceptSubjects` | ctx, query | `Promise<any>` | - |
| `listGlossariesByCreator` | ctx, query | `Promise<{ data: any; total: number; }>` | - |
| `listConceptSubjectsByConceptIds` | ctx, query | `Promise<any>` | - |
| `listAllTerms` | ctx, _query | `Promise<any>` | - |
| `listAllGlossaries` | ctx, _query | `Promise<any>` | - |
| `getGlossary` | ctx, query | `Promise<unknown>` | - |
| `getGlossaryConceptDetail` | ctx, query | `Promise<{ concept: {} | undefined; subjects: any; terms: any; availableSubjects: any; } | null>` | - |
| `getConceptVectorizationSnapshot` | ctx, query | `Promise<{ stringId: any; text: any; } | null>` | - |
| `fetchTermsByConceptIds` | drizzle, conceptIds, sourceLanguageId, translationLanguageId, confidenceMap? | `Promise<{ term: string; translation: string; definition: string | null; conceptId: number; glossaryId: string; confidence: number; }[]>` | Fetch full term pair details for a list of concept IDs.

Unlike `listLexicalTermSuggestions`, this does not perform any matching —
it simply resolves the source + translation term texts and definition for
the given concept IDs. Pairs with no matching term in either language are
omitted. |
| `buildConceptVectorizationText` | drizzle, conceptId | `Promise<string | null>` | Build a structured text representation of a term concept for embedding
vectorization, following the genus–differentia definition method.

Output format:
```
Terms: creeper、苦力怕、爬行者
Subjects:
 - 敌对生物: 危险且具侵略性的生物…
Definition: 绿色的，会悄悄接近玩家并自爆的怪物。
```

Returns `null` if no meaningful content exists (no terms, no subjects, no
definition), indicating that this concept should not be vectorized. |
| `countGlossaryConcepts` | ctx, query | `Promise<any>` | - |

### src/queries/comment

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listRootComments` | ctx, query | `Promise<any>` | - |
| `listCommentReactions` | ctx, query | `Promise<any>` | - |
| `listChildComments` | ctx, query | `Promise<any>` | - |

### src/queries/element

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listElements` | ctx, query | `Promise<any>` | - |
| `listElementsByDocument` | ctx, query | `Promise<any>` | - |
| `listElementsForDiff` | ctx, query | `Promise<any>` | - |
| `listCachedTranslatableStrings` | ctx, query | `Promise<any>` | - |
| `listAllElements` | ctx, _query | `Promise<any>` | - |
| `getElementWithChunkIds` | ctx, query | `Promise<unknown>` | - |
| `getElementSourceLocation` | ctx, query | `Promise<unknown>` | - |
| `getElementMeta` | ctx, query | `Promise<any>` | - |
| `getElementInfo` | ctx, query | `Promise<{ elementId: any; documentId: any; sourceText: any; sourceLanguageId: any; sortIndex: any; contexts: any; meta: any; translations: any; }>` | - |
| `getElementContexts` | ctx, query | `Promise<{ element: unknown; contexts: any; }>` | - |

### src/queries/document

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listElementIdsByDocument` | ctx, query | `Promise<any>` | - |
| `listDocumentElementsWithChunkIds` | ctx, query | `Promise<any>` | - |
| `listChunkVectorizationInputs` | ctx, query | `Promise<any>` | - |
| `getProjectRootDocument` | db, projectId | `Promise<string>` | Query the root document for a project — the document with no parent in the
closure table. |
| `getDocument` | ctx, query | `Promise<unknown>` | - |
| `getDocumentFirstElement` | ctx, query | `Promise<any>` | - |
| `getDocumentFileExportContext` | ctx, query | `Promise<unknown>` | - |
| `getDocumentElements` | ctx, query | `Promise<any>` | - |
| `getDocumentElementTranslationStatus` | ctx, query | `Promise<any>` | - |
| `getDocumentElementPageIndex` | ctx, query | `Promise<number>` | - |
| `getDocumentBlobInfo` | ctx, query | `Promise<unknown>` | - |
| `getChunkVectorStorageId` | ctx, query | `Promise<any>` | - |
| `getActiveFileName` | ctx, query | `Promise<any>` | - |
| `getActiveFileBlobInfo` | ctx, query | `Promise<unknown>` | - |
| `findProjectDocumentByName` | ctx, query | `Promise<unknown>` | - |
| `countDocumentTranslations` | ctx, query | `Promise<any>` | - |
| `countDocumentElements` | ctx, query | `Promise<any>` | - |
| `buildTranslationStatusConditions` | db, isTranslated?, isApproved?, languageId? | `SQL<unknown>[]` | - |

### src/queries/chunk

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listAllChunks` | ctx, _ | `Promise<any>` | - |

### src/queries/api-key

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `listApiKeysByUser` | ctx, query | `Promise<any>` | - |
| `getApiKeyByHash` | ctx, query | `Promise<any>` | - |

### src/queries/auth

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `getMfaProviderByServiceAndUser` | ctx, query | `Promise<unknown>` | - |
| `getAccountMetaByIdentity` | ctx, query | `Promise<any>` | - |
| `findUserByIdentifier` | ctx, query | `Promise<unknown>` | - |
| `findAccountByProviderIdentity` | ctx, query | `Promise<unknown>` | - |

### src/queries/agent

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `loadAgentRunSnapshot` | ctx, query | `Promise<any>` | - |
| `loadAgentRunMetadata` | ctx, query | `Promise<any>` | - |
| `loadAgentExternalOutputByIdempotency` | ctx, query | `Promise<any>` | - |
| `listProjectRuns` | ctx, query | `Promise<any>` | - |
| `listAgentSessions` | ctx, query | `Promise<any>` | - |
| `listAgentEvents` | ctx, query | `Promise<any>` | - |
| `listAgentDefinitions` | ctx, query | `Promise<any>` | - |
| `getRunNodeEvents` | ctx, query | `Promise<any>` | - |
| `getLatestCompletedRunBlackboard` | ctx, query | `Promise<unknown>` | - |
| `getAgentSessionRuntimeState` | ctx, query | `Promise<unknown>` | - |
| `getAgentSessionByExternalId` | ctx, query | `Promise<unknown>` | - |
| `getAgentRunRuntimeState` | ctx, query | `Promise<unknown>` | - |
| `getAgentRunInternalId` | ctx, query | `Promise<any>` | - |
| `getAgentDefinition` | ctx, query | `Promise<unknown>` | - |
| `getAgentDefinitionByInternalId` | ctx, query | `Promise<unknown>` | - |
| `findAgentRunByDeduplicationKey` | ctx, query | `Promise<any>` | - |
| `findAgentDefinitionByNameAndScope` | ctx, query | `Promise<unknown>` | - |

### src/commands/vector

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `upsertChunkVectors` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `updateVectorDimension` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `ensureVectorStorageSchema` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |

### src/commands/translation

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `upsertTranslationVote` | ctx, command | `Promise<{ result: unknown; events: any[]; }>` | - |
| `unapproveTranslation` | ctx, command | `Promise<{ result: undefined; events: any[]; }>` | - |
| `deleteTranslation` | ctx, command | `Promise<{ result: undefined; events: any[]; }>` | - |
| `createTranslations` | ctx, command | `Promise<{ result: any; events: any[]; }>` | - |
| `autoApproveDocumentTranslations` | ctx, command | `Promise<{ result: any; events: any[]; }>` | - |
| `approveTranslation` | ctx, command | `Promise<{ result: undefined; events: any[]; }>` | - |

### src/commands/user

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `updateUser` | ctx, command | `Promise<{ result: unknown; events: any[]; }>` | - |
| `updateUserAvatar` | ctx, command | `Promise<{ result: undefined; events: any[]; }>` | - |
| `createUser` | ctx, command | `Promise<{ result: unknown; events: any[]; }>` | - |

### src/commands/session

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `revokeSessionRecord` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `createSessionRecord` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |

### src/commands/string

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `createTranslatableStrings` | ctx, command | `Promise<{ result: any; events: never[]; }>` | - |
| `createChunkSet` | ctx, _command | `Promise<{ result: unknown; events: never[]; }>` | - |

### src/commands/qa

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `createQaResult` | ctx, command | `Promise<{ result: { id: any; }; events: never[]; }>` | - |
| `createQaResultWithItems` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `createQaResultItems` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |

### src/commands/setting

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `setSetting` | ctx, command | `Promise<{ result: undefined; events: any[]; }>` | - |

### src/commands/project

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `updateProject` | ctx, command | `Promise<{ result: unknown; events: any[]; }>` | - |
| `unlinkProjectMemories` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `unlinkProjectGlossaries` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `linkProjectMemories` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `linkProjectGlossaries` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `deleteProject` | ctx, command | `Promise<{ result: undefined; events: any[]; }>` | - |
| `createProject` | ctx, command | `Promise<{ result: unknown; events: any[]; }>` | - |
| `createProjectTranslationSnapshot` | ctx, command | `Promise<{ result: any; events: never[]; }>` | - |
| `addProjectTargetLanguages` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |

### src/commands/plugin

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `upsertPluginConfigInstance` | ctx, command | `Promise<{ result: unknown; events: never[]; }>` | - |
| `updatePluginConfigInstanceValue` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `uninstallPlugin` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `syncPluginServices` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `registerPluginDefinition` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `installPlugin` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `deletePluginServices` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |

### src/commands/permission

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `seedSystemRoles` | ctx, _command | `Promise<{ result: undefined; events: never[]; }>` | 幂等地确保 4 个系统角色存在于数据库中。
使用 INSERT ... ON CONFLICT DO NOTHING。 |
| `revokePermissionTuple` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | 删除权限关系元组。元组不存在时静默完成（幂等）。 |
| `insertAuditLogs` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | 批量插入鉴权审计日志。写入失败时静默忽略，不影响业务流程。 |
| `grantPermissionTuple` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | 插入权限关系元组，已存在则忽略（幂等）。 |
| `grantFirstUserSuperadmin` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | 检查是否为首位注册用户：若是，自动授予 system#superadmin 权限元组，
并将 setting "system:first_user_registered" 置为 true。

性能优化：只查一次 setting（O(1)），不走 count(*)。
幂等：若 setting 已存在则直接返回。 |

### src/commands/memory

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `createMemory` | ctx, command | `Promise<{ result: unknown; events: any[]; }>` | - |
| `createMemoryItems` | ctx, command | `Promise<{ result: any; events: never[]; }>` | - |

### src/commands/login-attempt

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `insertLoginAttempt` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |

### src/commands/language

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `ensureLanguages` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |

### src/commands/file

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `createOrReferenceBlobAndFile` | ctx, command | `Promise<{ result: { blobId: any; fileId: any; referenceCount: any; }; events: never[]; }>` | - |
| `createBlobAndFile` | ctx, command | `Promise<{ result: { blobId: any; fileId: any; }; events: never[]; }>` | - |
| `activateFile` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `rollbackBlobAndFile` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `deleteBlobAndFile` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `finalizePresignedFile` | ctx, command | `Promise<{ result: { conflicted: boolean; }; events: never[]; }>` | - |
| `createFile` | ctx, command | `Promise<{ result: unknown; events: never[]; }>` | - |
| `createBlob` | ctx, command | `Promise<{ result: unknown; events: never[]; }>` | - |

### src/commands/glossary

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `updateGlossaryConcept` | ctx, command | `Promise<{ result: { updated: boolean; glossaryId: any; }; events: any[]; }>` | - |
| `setConceptStringId` | ctx, command | `Promise<{ result: { updated: boolean; }; events: any[]; }>` | - |
| `deleteGlossaryTerm` | ctx, command | `Promise<{ result: { deleted: boolean; conceptId: any; glossaryId: any; }; events: any[]; }>` | - |
| `createGlossary` | ctx, command | `Promise<{ result: unknown; events: any[]; }>` | - |
| `createGlossaryTerms` | ctx, command | `Promise<{ result: { termIds: any; conceptIds: number[]; }; events: any[]; }>` | - |
| `createGlossaryConcept` | ctx, command | `Promise<{ result: unknown; events: any[]; }>` | - |
| `createGlossaryConceptSubject` | ctx, command | `Promise<{ result: unknown; events: never[]; }>` | - |
| `addGlossaryTermToConcept` | ctx, command | `Promise<{ result: { termId: any; conceptId: any; glossaryId: any; }; events: any[]; }>` | - |

### src/commands/element

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `deleteElementsByIds` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `createElements` | ctx, command | `Promise<{ result: any; events: never[]; }>` | - |
| `bulkUpdateElementsForDiff` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |

### src/commands/document

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `deleteDocument` | ctx, command | `Promise<{ result: undefined; events: any[]; }>` | - |
| `createVectorizedChunks` | ctx, command | `Promise<{ result: { chunkSetIds: any; chunkIds: any; }; events: never[]; }>` | - |
| `createRootDocument` | ctx, command | `Promise<{ result: unknown; events: any[]; }>` | - |
| `createDocumentUnderParent` | drizzle, input, parentId | `Promise<{ id: string; name: string | null; projectId: string; creatorId: string; fileHandlerId: number | null; fileId: number | null; isDirectory: boolean; createdAt: Date; updatedAt: Date; }>` | Create a new document under the given parent in the closure-table tree.
If `parentId` is null, the project root document is used as the parent. |
| `bulkUpdateChunkVectorMetadata` | ctx, command | `Promise<{ result: { updatedCount: any; }; events: never[]; }>` | - |

### src/commands/auth

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `registerUserWithPasswordAccount` | ctx, command | `Promise<{ result: { userId: any; providerIssuer: any; providedAccountId: any; }; events: never[]; }>` | - |
| `createMfaProvider` | ctx, command | `Promise<{ result: unknown; events: never[]; }>` | - |
| `createAccount` | ctx, command | `Promise<{ result: unknown; events: never[]; }>` | - |

### src/commands/comment

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `upsertCommentReaction` | ctx, command | `Promise<{ result: unknown; events: any[]; }>` | - |
| `deleteComment` | ctx, command | `Promise<{ result: undefined; events: any[]; }>` | - |
| `deleteCommentReaction` | ctx, command | `Promise<{ result: undefined; events: any[]; }>` | - |
| `createComment` | ctx, command | `Promise<{ result: unknown; events: any[]; }>` | - |

### src/commands/api-key

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `updateApiKeyLastUsed` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `revokeApiKey` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `createApiKey` | ctx, command | `Promise<{ result: { id: any; }; events: never[]; }>` | - |

### src/commands/agent

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `updateAgentDefinition` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `saveAgentRunSnapshot` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `saveAgentRunMetadata` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `saveAgentExternalOutput` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `saveAgentEvent` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `deleteAgentDefinition` | ctx, command | `Promise<{ result: undefined; events: never[]; }>` | - |
| `createAgentSession` | ctx, command | `Promise<{ result: { sessionId: any; }; events: never[]; }>` | - |
| `createAgentDefinition` | ctx, command | `Promise<{ result: { id: any; }; events: never[]; }>` | - |

## Type Index

| Type | Kind | Description |
|------|------|-------------|
| `DbHandle` | type | - |
| `DbContext` | type | - |
| `CommandResult` | type | - |
| `Query` | type | - |
| `Command` | type | - |
| `OperationContext` | type | Cross-cutting context passed through operation chains.
Contains a trace ID for distributed tracing, an optional abort signal,
and an optional plugin manager instance override. |
| `ExecutorContext` | type | - |
| `ListAllProjectsQuery` | type | - |
| `ListAllUsersQuery` | type | - |
| `EventMap` | type | - |
| `EventOf` | type | - |
| `AnyEventOf` | type | - |
| `TypedEventHandler` | type | - |
| `WaitForEventOptions` | type | - |
| `TypedEventBus` | type | - |
| `CreateEventOptions` | type | - |
| `EventCollector` | type | - |
| `DomainEventMap` | type | - |
| `DomainEvent` | type | - |
| `DomainEventType` | type | - |
| `DomainEventBus` | type | - |
| `ProjectCapabilities` | type | - |
| `DocumentCapabilities` | type | - |
| `TranslationCapabilities` | type | - |
| `SettingCapabilities` | type | - |
| `AuthCapabilities` | type | - |
| `VectorCapabilities` | type | - |
| `LanguageCapabilities` | type | - |
| `UserCapabilities` | type | - |
| `CommentCapabilities` | type | - |
| `AgentCapabilities` | type | - |
| `ElementCapabilities` | type | - |
| `QaCapabilities` | type | - |
| `GlossaryCapabilities` | type | - |
| `MemoryCapabilities` | type | - |
| `PluginCapabilities` | type | - |
| `CacheStore` | interface | 缓存存储接口 |
| `SessionStore` | interface | 会话存储接口（基于 Hash 结构） |
| `CacheOptions` | type | 缓存配置选项 |
| `GetUserQuery` | type | - |
| `GetUserAvatarFileQuery` | type | - |
| `UserAvatarFileRef` | type | - |
| `SearchChunkCosineSimilarityQuery` | type | - |
| `ChunkCosineSimilarityItem` | type | - |
| `GetChunkVectorsQuery` | type | - |
| `VectorChunk` | type | - |
| `GetSettingQuery` | type | - |
| `ListUserTranslationHistoryQuery` | type | - |
| `ListUserTranslationHistoryResult` | type | - |
| `ListTranslationsByIdsQuery` | type | - |
| `TranslationWithVoteAndText` | type | - |
| `ListTranslationsByElementQuery` | type | - |
| `TranslationListItem` | type | - |
| `ListQaResultsByTranslationQuery` | type | - |
| `GetTranslationVoteTotalQuery` | type | - |
| `GetSelfTranslationVoteQuery` | type | - |
| `ListSessionsByUserQuery` | interface | - |
| `SessionRecordRow` | interface | - |
| `ListTranslatableStringsByIdQuery` | type | - |
| `ListChunksByStringIdsQuery` | type | - |
| `ListAllTranslatableStringsQuery` | type | - |
| `GetTranslatableStringQuery` | type | - |
| `GetStringByValueQuery` | type | - |
| `CountTranslatableStringsQuery` | type | - |
| `ListQaResultItemsQuery` | type | - |
| `ListDocumentGlossaryIdsQuery` | type | - |
| `GetTranslationQaContextQuery` | type | - |
| `TranslationQaContext` | type | - |
| `ListProjectsByCreatorQuery` | type | - |
| `ListProjectsByCreatorResult` | type | - |
| `ListProjectDocumentsQuery` | type | - |
| `ProjectDocumentRow` | type | - |
| `ListOwnedProjectsQuery` | type | - |
| `GetProjectQuery` | type | - |
| `GetProjectTargetLanguagesQuery` | type | - |
| `CountProjectElementsQuery` | type | - |
| `LoadUserSystemRolesQuery` | type | - |
| `UserSystemRole` | type | - |
| `ListPermissionSubjectsQuery` | type | - |
| `PermissionSubjectRow` | type | - |
| `ListPermissionObjectsQuery` | type | - |
| `PermissionObjectRow` | type | - |
| `GetSubjectPermissionTuplesQuery` | type | - |
| `SubjectPermissionTupleRow` | type | - |
| `ListPluginsQuery` | type | - |
| `ListPluginServicesQuery` | type | - |
| `PluginServiceDbRecord` | type | - |
| `ListPluginServicesForInstallationQuery` | type | - |
| `PluginServiceRecord` | type | - |
| `ListPluginServiceIdsByTypeQuery` | type | - |
| `ListInstalledServicesByTypeQuery` | type | - |
| `InstalledServiceRecord` | type | - |
| `ListInstalledPluginsQuery` | type | - |
| `IsPluginInstalledQuery` | type | - |
| `GetPluginQuery` | type | - |
| `GetPluginServiceByTypeQuery` | type | - |
| `GetPluginServiceByIdQuery` | type | - |
| `PluginServiceIdentity` | type | - |
| `GetPluginInstallationQuery` | type | - |
| `GetPluginConfigQuery` | type | - |
| `GetPluginConfigInstanceQuery` | type | - |
| `GetPluginConfigInstanceByInstallationQuery` | type | - |
| `PluginConfigInstanceData` | type | - |
| `CheckServiceReferencesQuery` | type | - |
| `ListProjectMemoriesQuery` | type | - |
| `ListOwnedMemoriesQuery` | type | - |
| `ListMemorySuggestionsByChunkIdsQuery` | type | - |
| `MemorySuggestionCandidateRow` | type | - |
| `ListMemoryIdsByProjectQuery` | type | - |
| `ListMemoriesByCreatorQuery` | type | - |
| `ListMemoriesByCreatorResult` | type | - |
| `RawMemorySuggestion` | type | - |
| `ListExactMemorySuggestionsQuery` | type | - |
| `ListTrgmMemorySuggestionsQuery` | type | - |
| `ListAllMemoriesQuery` | type | - |
| `GetSearchMemoryChunkRangeQuery` | type | - |
| `GetMemoryQuery` | type | - |
| `FetchTranslationsForMemoryQuery` | type | - |
| `TranslationForMemoryRow` | type | - |
| `CountMemoryItemsQuery` | type | - |
| `CountRecentAttemptsQuery` | interface | - |
| `ListLanguagesQuery` | type | - |
| `ListLanguagesResult` | type | - |
| `GetLanguageQuery` | type | - |
| `ListAllFilesQuery` | type | - |
| `GetFileQuery` | type | - |
| `GetBlobByKeyQuery` | type | - |
| `ListTermConceptIdsBySubjectQuery` | type | - |
| `ListSemanticTermSearchRangeQuery` | type | - |
| `SemanticTermSearchRangeRow` | type | - |
| `ListProjectGlossaryIdsQuery` | type | - |
| `ListProjectGlossariesQuery` | type | - |
| `ListOwnedGlossariesQuery` | type | - |
| `ListLexicalTermSuggestionsQuery` | type | - |
| `LexicalTermSuggestion` | type | - |
| `ListGlossaryTermPairsQuery` | type | - |
| `GlossaryTermPairData` | type | - |
| `ListGlossaryTermPairsResult` | type | - |
| `ListGlossaryConceptsQuery` | type | - |
| `GlossaryConceptData` | type | - |
| `ListGlossaryConceptsResult` | type | - |
| `ListGlossaryConceptSubjectsQuery` | type | - |
| `GlossaryConceptSubject` | type | - |
| `ListGlossariesByCreatorQuery` | type | - |
| `ListGlossariesByCreatorResult` | type | - |
| `ListConceptSubjectsByConceptIdsQuery` | type | - |
| `ConceptSubjectRow` | type | - |
| `ListAllTermsQuery` | type | - |
| `TermWithConcept` | type | - |
| `ListAllGlossariesQuery` | type | - |
| `GetGlossaryQuery` | type | - |
| `GetGlossaryConceptDetailQuery` | type | - |
| `GlossaryConceptDetail` | type | - |
| `GetConceptVectorizationSnapshotQuery` | type | - |
| `ConceptVectorizationSnapshot` | type | - |
| `LookedUpTerm` | type | Represents a resolved term pair (source + translation) for a given concept.
Alias to TermMatch from |
| `CountGlossaryConceptsQuery` | type | - |
| `ListRootCommentsQuery` | type | - |
| `ListCommentReactionsQuery` | type | - |
| `ListChildCommentsQuery` | type | - |
| `ListElementsQuery` | type | - |
| `ElementWithString` | type | - |
| `ListElementsByDocumentQuery` | type | - |
| `ListElementsForDiffQuery` | type | - |
| `ElementForDiff` | type | - |
| `ListCachedTranslatableStringsQuery` | type | - |
| `CachedTranslatableString` | type | - |
| `ListAllElementsQuery` | type | - |
| `GetElementWithChunkIdsQuery` | type | - |
| `ElementWithChunkIds` | type | - |
| `GetElementSourceLocationQuery` | type | - |
| `ElementSourceLocationRow` | type | - |
| `GetElementMetaQuery` | type | - |
| `GetElementInfoQuery` | type | - |
| `ElementInfoQueryResult` | type | - |
| `GetElementContextsQuery` | type | - |
| `GetElementContextsResult` | type | - |
| `ListElementIdsByDocumentQuery` | type | - |
| `ListDocumentElementsWithChunkIdsQuery` | type | - |
| `DocumentElementWithChunkIds` | type | - |
| `ListChunkVectorizationInputsQuery` | type | - |
| `ChunkVectorizationInput` | type | - |
| `GetDocumentQuery` | type | - |
| `GetDocumentFirstElementQuery` | type | - |
| `GetDocumentFileExportContextQuery` | type | - |
| `DocumentFileExportContext` | type | - |
| `ElementTranslationStatus` | type | - |
| `GetDocumentElementsQuery` | type | - |
| `DocumentElementRow` | type | - |
| `GetDocumentElementTranslationStatusQuery` | type | - |
| `GetDocumentElementPageIndexQuery` | type | - |
| `GetDocumentBlobInfoQuery` | type | - |
| `DocumentBlobInfo` | type | - |
| `GetChunkVectorStorageIdQuery` | type | - |
| `GetActiveFileNameQuery` | type | - |
| `GetActiveFileBlobInfoQuery` | type | - |
| `ActiveFileBlobInfo` | type | - |
| `FindProjectDocumentByNameQuery` | type | - |
| `CountDocumentTranslationsQuery` | type | - |
| `CountDocumentElementsQuery` | type | - |
| `ListAllChunksQuery` | type | - |
| `ListApiKeysByUserQuery` | interface | - |
| `GetApiKeyByHashQuery` | interface | - |
| `ApiKeyRow` | interface | - |
| `GetMfaProviderByServiceAndUserQuery` | type | - |
| `GetAccountMetaByIdentityQuery` | type | - |
| `FindUserByIdentifierQuery` | type | - |
| `AuthUserIdentity` | type | - |
| `FindAccountByProviderIdentityQuery` | type | - |
| `AccountIdentity` | type | - |
| `LoadAgentRunSnapshotQuery` | type | - |
| `LoadAgentRunMetadataQuery` | type | - |
| `AgentRunMetadataRow` | type | - |
| `LoadAgentExternalOutputByIdempotencyQuery` | type | - |
| `AgentExternalOutputRow` | type | - |
| `ListProjectRunsQuery` | type | - |
| `ProjectRunRow` | type | - |
| `ListAgentSessionsQuery` | type | - |
| `ListAgentEventsQuery` | type | - |
| `AgentEventRow` | type | - |
| `ListAgentDefinitionsQuery` | type | - |
| `GetRunNodeEventsQuery` | type | - |
| `RunNodeEventRow` | type | - |
| `GetLatestCompletedRunBlackboardQuery` | type | - |
| `LatestCompletedRunBlackboard` | type | - |
| `GetAgentSessionRuntimeStateQuery` | type | - |
| `AgentSessionRuntimeState` | type | - |
| `GetAgentSessionByExternalIdQuery` | type | - |
| `AgentSessionByExternalId` | type | - |
| `GetAgentRunRuntimeStateQuery` | type | - |
| `AgentRunRuntimeState` | type | - |
| `GetAgentRunInternalIdQuery` | type | - |
| `GetAgentDefinitionQuery` | type | - |
| `GetAgentDefinitionByInternalIdQuery` | type | - |
| `FindAgentRunByDeduplicationKeyQuery` | type | - |
| `FindAgentDefinitionByNameAndScopeQuery` | type | - |
| `UpsertChunkVectorsCommand` | type | - |
| `UpdateVectorDimensionCommand` | type | - |
| `EnsureVectorStorageSchemaCommand` | type | - |
| `UpsertTranslationVoteCommand` | type | - |
| `UnapproveTranslationCommand` | type | - |
| `DeleteTranslationCommand` | type | - |
| `CreateTranslationsCommand` | type | - |
| `AutoApproveDocumentTranslationsCommand` | type | - |
| `ApproveTranslationCommand` | type | - |
| `UpdateUserCommand` | type | - |
| `UpdateUserAvatarCommand` | type | - |
| `CreateUserCommand` | type | - |
| `RevokeSessionRecordCommand` | interface | - |
| `CreateSessionRecordCommand` | interface | - |
| `CreateTranslatableStringsCommand` | type | - |
| `CreateChunkSetCommand` | type | - |
| `CreateQaResultCommand` | type | - |
| `CreateQaResultWithItemsCommand` | type | - |
| `CreateQaResultItemsCommand` | type | - |
| `SetSettingCommand` | type | - |
| `UpdateProjectCommand` | type | - |
| `UnlinkProjectMemoriesCommand` | type | - |
| `UnlinkProjectGlossariesCommand` | type | - |
| `LinkProjectMemoriesCommand` | type | - |
| `LinkProjectGlossariesCommand` | type | - |
| `DeleteProjectCommand` | type | - |
| `CreateProjectCommand` | type | - |
| `CreateProjectTranslationSnapshotCommand` | type | - |
| `AddProjectTargetLanguagesCommand` | type | - |
| `UpsertPluginConfigInstanceCommand` | type | - |
| `UpdatePluginConfigInstanceValueCommand` | type | - |
| `UninstallPluginCommand` | type | - |
| `SyncPluginServicesCommand` | type | - |
| `RegisterPluginDefinitionCommand` | type | - |
| `InstallPluginCommand` | type | - |
| `DeletePluginServicesCommand` | type | - |
| `SeedSystemRolesCommand` | type | - |
| `RevokePermissionTupleCommand` | type | - |
| `AuditLogEntry` | type | - |
| `InsertAuditLogsCommand` | type | - |
| `GrantPermissionTupleCommand` | type | - |
| `GrantFirstUserSuperadminCommand` | type | - |
| `CreateMemoryCommand` | type | - |
| `CreateMemoryItemsCommand` | type | - |
| `CreatedMemoryItemId` | type | - |
| `InsertLoginAttemptCommand` | interface | - |
| `EnsureLanguagesCommand` | type | - |
| `CreateOrReferenceBlobAndFileCommand` | type | - |
| `CreateOrReferenceBlobAndFileResult` | type | - |
| `CreateBlobAndFileCommand` | type | - |
| `CreateBlobAndFileResult` | type | - |
| `ActivateFileCommand` | type | - |
| `RollbackBlobAndFileCommand` | type | - |
| `DeleteBlobAndFileCommand` | type | - |
| `FinalizePresignedFileCommand` | type | - |
| `FinalizePresignedFileResult` | type | - |
| `CreateFileCommand` | type | - |
| `CreateBlobCommand` | type | - |
| `UpdateGlossaryConceptCommand` | type | - |
| `UpdateGlossaryConceptResult` | type | - |
| `SetConceptStringIdCommand` | type | - |
| `SetConceptStringIdResult` | type | - |
| `DeleteGlossaryTermCommand` | type | - |
| `DeleteGlossaryTermResult` | type | - |
| `CreateGlossaryCommand` | type | - |
| `CreateGlossaryTermsCommand` | type | - |
| `CreateGlossaryTermsResult` | type | - |
| `CreateGlossaryConceptCommand` | type | - |
| `CreateGlossaryConceptSubjectCommand` | type | - |
| `AddGlossaryTermToConceptCommand` | type | - |
| `AddGlossaryTermToConceptResult` | type | - |
| `DeleteElementsByIdsCommand` | type | - |
| `CreateElementsCommand` | type | - |
| `BulkUpdateElementsForDiffCommand` | type | - |
| `BulkUpdateElementsForDiffCommandInput` | type | - |
| `DeleteDocumentCommand` | type | - |
| `CreateVectorizedChunksCommand` | type | - |
| `CreateVectorizedChunksResult` | type | - |
| `CreateRootDocumentCommand` | type | - |
| `BulkUpdateChunkVectorMetadataCommand` | type | - |
| `BulkUpdateChunkVectorMetadataResult` | type | - |
| `RegisterUserWithPasswordAccountCommand` | type | - |
| `RegisterUserWithPasswordAccountResult` | type | - |
| `CreateMfaProviderCommand` | type | - |
| `CreateAccountCommand` | type | - |
| `CreateAccountResult` | type | - |
| `UpsertCommentReactionCommand` | type | - |
| `DeleteCommentCommand` | type | - |
| `DeleteCommentReactionCommand` | type | - |
| `CreateCommentCommand` | type | - |
| `UpdateApiKeyLastUsedCommand` | interface | - |
| `RevokeApiKeyCommand` | interface | - |
| `CreateApiKeyCommand` | interface | - |
| `UpdateAgentDefinitionCommand` | type | - |
| `SaveAgentRunSnapshotCommand` | type | - |
| `SaveAgentRunMetadataCommand` | type | - |
| `SaveAgentExternalOutputCommand` | type | - |
| `SaveAgentEventCommand` | type | - |
| `DeleteAgentDefinitionCommand` | type | - |
| `CreateAgentSessionCommand` | type | - |
| `CreateAgentDefinitionCommand` | type | - |

## Detailed Documentation

### src

#### `executeCommand`

```typescript
async executeCommand(execCtx: ExecutorContext, command: Command<C, R>, input: C): Promise<R>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| execCtx | `ExecutorContext` | - |
| command | `Command<C, R>` | - |
| input | `C` | - |

#### `executeQuery`

```typescript
async executeQuery(execCtx: Pick<ExecutorContext, "db">, query: Query<Q, R>, input: Q): Promise<R>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| execCtx | `Pick<ExecutorContext, "db">` | - |
| query | `Query<Q, R>` | - |
| input | `Q` | - |

### src/queries

#### `listAllProjects`

```typescript
async listAllProjects(ctx: any, _query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| _query | `any` | - |

#### `listAllUsers`

```typescript
async listAllUsers(ctx: any, _query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| _query | `any` | - |

### src/infrastructure

#### `getDbHandle`

```typescript
async getDbHandle(): Promise<DrizzleDB>
```

#### `getRedisHandle`

```typescript
async getRedisHandle(): Promise<RedisConnection>
```

### src/events

#### `createEvent`

```typescript
createEvent(type: T, payload: M[T], options?: CreateEventOptions | undefined): EventOf<M, T>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| type | `T` | - |
| payload | `M[T]` | - |
| options? | `CreateEventOptions | undefined` | - |

#### `createInProcessCollector`

```typescript
createInProcessCollector(bus: DomainEventBus): EventCollector
```

| Parameter | Type | Description |
|-----------|------|-------------|
| bus | `DomainEventBus` | - |

#### `domainEvent`

```typescript
domainEvent(type: T, payload: DomainEventMap[T]): EventOf<DomainEventMap, T>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| type | `T` | - |
| payload | `DomainEventMap[T]` | - |

### src/commands

### src/capabilities

#### `createPluginCapabilities`

```typescript
createPluginCapabilities(execCtx: ExecutorContext, checkPermission?: CheckPermissionFn | undefined): PluginCapabilities
```

| Parameter | Type | Description |
|-----------|------|-------------|
| execCtx | `ExecutorContext` | - |
| checkPermission? | `CheckPermissionFn | undefined` | - |

### src/cache

#### `generateCacheKey`

生成输入数据的哈希值作为缓存键

```typescript
generateCacheKey(payload: unknown): string
```

| Parameter | Type | Description |
|-----------|------|-------------|
| payload | `unknown` | - |

#### `initCacheStore`

初始化缓存存储

```typescript
initCacheStore(store: CacheStore)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| store | `CacheStore` | - |

#### `getCacheStore`

获取缓存存储实例

```typescript
getCacheStore(): CacheStore
```

#### `initSessionStore`

初始化会话存储

```typescript
initSessionStore(store: SessionStore)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| store | `SessionStore` | - |

#### `getSessionStore`

获取会话存储实例

```typescript
getSessionStore(): SessionStore
```

#### `withCache`

带缓存的高阶函数包装器
包装一个异步函数，使其自动使用缓存

```typescript
withCache(operation: (input: I) => Promise<O>, options: CacheOptions): (input: I) => Promise<O>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| operation | `(input: I) => Promise<O>` | - |
| options | `CacheOptions` | - |

### src/queries/user

#### `getUser`

```typescript
async getUser(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getUserAvatarFile`

```typescript
async getUserAvatarFile(ctx: any, query: any): Promise<{} | null>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getFirstRegisteredUser`

```typescript
async getFirstRegisteredUser(ctx: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |

### src/queries/vector

#### `searchChunkCosineSimilarity`

```typescript
async searchChunkCosineSimilarity(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getChunkVectors`

```typescript
async getChunkVectors(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/setting

#### `getSetting`

```typescript
async getSetting(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/translation

#### `listUserTranslationHistory`

```typescript
async listUserTranslationHistory(ctx: any, query: any): Promise<{ translations: any; nextCursor: any; hasMore: boolean; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listTranslationsByIds`

```typescript
async listTranslationsByIds(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listTranslationsByElement`

```typescript
async listTranslationsByElement(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listQaResultsByTranslation`

```typescript
async listQaResultsByTranslation(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getTranslationVoteTotal`

```typescript
async getTranslationVoteTotal(ctx: any, query: any): Promise<number>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getSelfTranslationVote`

```typescript
async getSelfTranslationVote(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/session

#### `listSessionsByUser`

```typescript
async listSessionsByUser(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/string

#### `listTranslatableStringsById`

```typescript
async listTranslatableStringsById(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listChunksByStringIds`

```typescript
async listChunksByStringIds(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listAllTranslatableStrings`

```typescript
async listAllTranslatableStrings(ctx: any, _: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| _ | `any` | - |

#### `getTranslatableString`

```typescript
async getTranslatableString(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getStringByValue`

```typescript
async getStringByValue(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `countTranslatableStrings`

```typescript
async countTranslatableStrings(ctx: any, _query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| _query | `any` | - |

### src/queries/qa

#### `listQaResultItems`

```typescript
async listQaResultItems(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listDocumentGlossaryIds`

```typescript
async listDocumentGlossaryIds(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getTranslationQaContext`

```typescript
async getTranslationQaContext(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/project

#### `listProjectsByCreator`

```typescript
async listProjectsByCreator(ctx: any, query: any): Promise<{ data: any; total: number; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listProjectDocuments`

```typescript
async listProjectDocuments(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listOwnedProjects`

```typescript
async listOwnedProjects(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getProject`

```typescript
async getProject(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getProjectTargetLanguages`

```typescript
async getProjectTargetLanguages(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `countProjectElements`

```typescript
async countProjectElements(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/permission

#### `loadUserSystemRoles`

加载用户的系统级角色（system object 上的权限元组）。
返回用户对 system:* 持有的所有 relation 列表。

```typescript
async loadUserSystemRoles(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listPermissionSubjects`

```typescript
async listPermissionSubjects(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listPermissionObjects`

```typescript
async listPermissionObjects(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getSubjectPermissionTuples`

```typescript
async getSubjectPermissionTuples(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/plugin

#### `listPlugins`

```typescript
async listPlugins(ctx: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |

#### `listPluginServices`

```typescript
async listPluginServices(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listPluginServicesForInstallation`

```typescript
async listPluginServicesForInstallation(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listPluginServiceIdsByType`

```typescript
async listPluginServiceIdsByType(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listInstalledServicesByType`

```typescript
async listInstalledServicesByType(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listInstalledPlugins`

```typescript
async listInstalledPlugins(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `isPluginInstalled`

```typescript
async isPluginInstalled(ctx: any, query: any): Promise<boolean>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getPlugin`

```typescript
async getPlugin(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getPluginServiceByType`

```typescript
async getPluginServiceByType(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getPluginServiceById`

```typescript
async getPluginServiceById(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getPluginInstallation`

```typescript
async getPluginInstallation(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getPluginConfig`

```typescript
async getPluginConfig(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getPluginConfigInstance`

```typescript
async getPluginConfigInstance(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getPluginConfigInstanceByInstallation`

```typescript
async getPluginConfigInstanceByInstallation(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `checkServiceReferences`

```typescript
async checkServiceReferences(ctx: any, query: any): Promise<boolean>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/memory

#### `listProjectMemories`

```typescript
async listProjectMemories(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listOwnedMemories`

```typescript
async listOwnedMemories(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listMemorySuggestionsByChunkIds`

```typescript
async listMemorySuggestionsByChunkIds(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listMemoryIdsByProject`

```typescript
async listMemoryIdsByProject(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listMemoriesByCreator`

```typescript
async listMemoriesByCreator(ctx: any, query: any): Promise<{ data: any; total: number; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listExactMemorySuggestions`

```typescript
async listExactMemorySuggestions(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listTrgmMemorySuggestions`

```typescript
async listTrgmMemorySuggestions(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listAllMemories`

```typescript
async listAllMemories(ctx: any, _query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| _query | `any` | - |

#### `getSearchMemoryChunkRange`

```typescript
async getSearchMemoryChunkRange(ctx: any, query: any): Promise<any[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getMemory`

```typescript
async getMemory(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `fetchTranslationsForMemory`

```typescript
async fetchTranslationsForMemory(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `countMemoryItems`

```typescript
async countMemoryItems(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/login-attempt

#### `countRecentAttempts`

```typescript
async countRecentAttempts(ctx: any, query: any): Promise<number>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/language

#### `listLanguages`

```typescript
async listLanguages(ctx: any, query: any): Promise<{ languages: any; hasMore: boolean; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getLanguage`

```typescript
async getLanguage(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/file

#### `listAllFiles`

```typescript
async listAllFiles(ctx: any, _query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| _query | `any` | - |

#### `getFile`

```typescript
async getFile(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getBlobByKey`

```typescript
async getBlobByKey(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/glossary

#### `listTermConceptIdsBySubject`

```typescript
async listTermConceptIdsBySubject(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listSemanticTermSearchRange`

```typescript
async listSemanticTermSearchRange(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listProjectGlossaryIds`

```typescript
async listProjectGlossaryIds(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listProjectGlossaries`

```typescript
async listProjectGlossaries(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listOwnedGlossaries`

```typescript
async listOwnedGlossaries(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listLexicalTermSuggestions`

```typescript
async listLexicalTermSuggestions(ctx: any, query: any): Promise<LexicalTermSuggestion[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listGlossaryTermPairs`

```typescript
async listGlossaryTermPairs(ctx: any, query: any): Promise<{ data: any; total: number; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listGlossaryConcepts`

```typescript
async listGlossaryConcepts(ctx: any, query: any): Promise<{ data: any[]; total: number; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listGlossaryConceptSubjects`

```typescript
async listGlossaryConceptSubjects(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listGlossariesByCreator`

```typescript
async listGlossariesByCreator(ctx: any, query: any): Promise<{ data: any; total: number; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listConceptSubjectsByConceptIds`

```typescript
async listConceptSubjectsByConceptIds(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listAllTerms`

```typescript
async listAllTerms(ctx: any, _query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| _query | `any` | - |

#### `listAllGlossaries`

```typescript
async listAllGlossaries(ctx: any, _query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| _query | `any` | - |

#### `getGlossary`

```typescript
async getGlossary(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getGlossaryConceptDetail`

```typescript
async getGlossaryConceptDetail(ctx: any, query: any): Promise<{ concept: {} | undefined; subjects: any; terms: any; availableSubjects: any; } | null>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getConceptVectorizationSnapshot`

```typescript
async getConceptVectorizationSnapshot(ctx: any, query: any): Promise<{ stringId: any; text: any; } | null>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `fetchTermsByConceptIds`

Fetch full term pair details for a list of concept IDs.

Unlike `listLexicalTermSuggestions`, this does not perform any matching —
it simply resolves the source + translation term texts and definition for
the given concept IDs. Pairs with no matching term in either language are
omitted.

```typescript
async fetchTermsByConceptIds(drizzle: import("/workspaces/cat/node_modules/.pnpm/drizzle-orm@1.0.0-beta.19_@electric-sql+pglite@0.3.14_@opentelemetry+api@1.9.0_@sinclai_f2302f5647c9146a1eb62ddcfa7c9e59/node_modules/drizzle-orm/node-postgres/driver").NodePgDatabase<import("/workspaces/cat/packages/db/dist/index").DrizzleSchema, import("/workspaces/cat/packages/db/dist/index").EmptyRelations> & { $client: import("/workspaces/cat/node_modules/.pnpm/@types+pg@8.18.0/node_modules/@types/pg/index").Client; }, conceptIds: number[], sourceLanguageId: string, translationLanguageId: string, confidenceMap?: Map<number, number> | undefined): Promise<{ term: string; translation: string; definition: string | null; conceptId: number; glossaryId: string; confidence: number; }[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| drizzle | `import("/workspaces/cat/node_modules/.pnpm/drizzle-orm@1.0.0-beta.19_@electric-sql+pglite@0.3.14_@opentelemetry+api@1.9.0_@sinclai_f2302f5647c9146a1eb62ddcfa7c9e59/node_modules/drizzle-orm/node-postgres/driver").NodePgDatabase<import("/workspaces/cat/packages/db/dist/index").DrizzleSchema, import("/workspaces/cat/packages/db/dist/index").EmptyRelations> & { $client: import("/workspaces/cat/node_modules/.pnpm/@types+pg@8.18.0/node_modules/@types/pg/index").Client; }` | - |
| conceptIds | `number[]` | - |
| sourceLanguageId | `string` | - |
| translationLanguageId | `string` | - |
| confidenceMap? | `Map<number, number> | undefined` | - |

#### `buildConceptVectorizationText`

Build a structured text representation of a term concept for embedding
vectorization, following the genus–differentia definition method.

Output format:
```
Terms: creeper、苦力怕、爬行者
Subjects:
 - 敌对生物: 危险且具侵略性的生物…
Definition: 绿色的，会悄悄接近玩家并自爆的怪物。
```

Returns `null` if no meaningful content exists (no terms, no subjects, no
definition), indicating that this concept should not be vectorized.

```typescript
async buildConceptVectorizationText(drizzle: import("/workspaces/cat/node_modules/.pnpm/drizzle-orm@1.0.0-beta.19_@electric-sql+pglite@0.3.14_@opentelemetry+api@1.9.0_@sinclai_f2302f5647c9146a1eb62ddcfa7c9e59/node_modules/drizzle-orm/node-postgres/driver").NodePgDatabase<import("/workspaces/cat/packages/db/dist/index").DrizzleSchema, import("/workspaces/cat/packages/db/dist/index").EmptyRelations> & { $client: import("/workspaces/cat/node_modules/.pnpm/@types+pg@8.18.0/node_modules/@types/pg/index").Client; }, conceptId: number): Promise<string | null>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| drizzle | `import("/workspaces/cat/node_modules/.pnpm/drizzle-orm@1.0.0-beta.19_@electric-sql+pglite@0.3.14_@opentelemetry+api@1.9.0_@sinclai_f2302f5647c9146a1eb62ddcfa7c9e59/node_modules/drizzle-orm/node-postgres/driver").NodePgDatabase<import("/workspaces/cat/packages/db/dist/index").DrizzleSchema, import("/workspaces/cat/packages/db/dist/index").EmptyRelations> & { $client: import("/workspaces/cat/node_modules/.pnpm/@types+pg@8.18.0/node_modules/@types/pg/index").Client; }` | - |
| conceptId | `number` | - |

#### `countGlossaryConcepts`

```typescript
async countGlossaryConcepts(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/comment

#### `listRootComments`

```typescript
async listRootComments(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listCommentReactions`

```typescript
async listCommentReactions(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listChildComments`

```typescript
async listChildComments(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/element

#### `listElements`

```typescript
async listElements(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listElementsByDocument`

```typescript
async listElementsByDocument(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listElementsForDiff`

```typescript
async listElementsForDiff(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listCachedTranslatableStrings`

```typescript
async listCachedTranslatableStrings(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listAllElements`

```typescript
async listAllElements(ctx: any, _query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| _query | `any` | - |

#### `getElementWithChunkIds`

```typescript
async getElementWithChunkIds(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getElementSourceLocation`

```typescript
async getElementSourceLocation(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getElementMeta`

```typescript
async getElementMeta(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getElementInfo`

```typescript
async getElementInfo(ctx: any, query: any): Promise<{ elementId: any; documentId: any; sourceText: any; sourceLanguageId: any; sortIndex: any; contexts: any; meta: any; translations: any; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getElementContexts`

```typescript
async getElementContexts(ctx: any, query: any): Promise<{ element: unknown; contexts: any; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/document

#### `listElementIdsByDocument`

```typescript
async listElementIdsByDocument(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listDocumentElementsWithChunkIds`

```typescript
async listDocumentElementsWithChunkIds(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listChunkVectorizationInputs`

```typescript
async listChunkVectorizationInputs(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getProjectRootDocument`

Query the root document for a project — the document with no parent in the
closure table.

```typescript
async getProjectRootDocument(db: Omit<DrizzleClient, "$client">, projectId: string): Promise<string>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| db | `Omit<DrizzleClient, "$client">` | - |
| projectId | `string` | - |

#### `getDocument`

```typescript
async getDocument(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getDocumentFirstElement`

```typescript
async getDocumentFirstElement(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getDocumentFileExportContext`

```typescript
async getDocumentFileExportContext(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getDocumentElements`

```typescript
async getDocumentElements(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getDocumentElementTranslationStatus`

```typescript
async getDocumentElementTranslationStatus(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getDocumentElementPageIndex`

```typescript
async getDocumentElementPageIndex(ctx: any, query: any): Promise<number>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getDocumentBlobInfo`

```typescript
async getDocumentBlobInfo(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getChunkVectorStorageId`

```typescript
async getChunkVectorStorageId(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getActiveFileName`

```typescript
async getActiveFileName(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getActiveFileBlobInfo`

```typescript
async getActiveFileBlobInfo(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `findProjectDocumentByName`

```typescript
async findProjectDocumentByName(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `countDocumentTranslations`

```typescript
async countDocumentTranslations(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `countDocumentElements`

```typescript
async countDocumentElements(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `buildTranslationStatusConditions`

```typescript
buildTranslationStatusConditions(db: DbHandle, isTranslated?: boolean | undefined, isApproved?: boolean | undefined, languageId?: string | undefined): SQL<unknown>[]
```

| Parameter | Type | Description |
|-----------|------|-------------|
| db | `DbHandle` | - |
| isTranslated? | `boolean | undefined` | - |
| isApproved? | `boolean | undefined` | - |
| languageId? | `string | undefined` | - |

### src/queries/chunk

#### `listAllChunks`

```typescript
async listAllChunks(ctx: any, _: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| _ | `any` | - |

### src/queries/api-key

#### `listApiKeysByUser`

```typescript
async listApiKeysByUser(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getApiKeyByHash`

```typescript
async getApiKeyByHash(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/auth

#### `getMfaProviderByServiceAndUser`

```typescript
async getMfaProviderByServiceAndUser(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getAccountMetaByIdentity`

```typescript
async getAccountMetaByIdentity(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `findUserByIdentifier`

```typescript
async findUserByIdentifier(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `findAccountByProviderIdentity`

```typescript
async findAccountByProviderIdentity(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/queries/agent

#### `loadAgentRunSnapshot`

```typescript
async loadAgentRunSnapshot(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `loadAgentRunMetadata`

```typescript
async loadAgentRunMetadata(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `loadAgentExternalOutputByIdempotency`

```typescript
async loadAgentExternalOutputByIdempotency(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listProjectRuns`

```typescript
async listProjectRuns(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listAgentSessions`

```typescript
async listAgentSessions(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listAgentEvents`

```typescript
async listAgentEvents(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `listAgentDefinitions`

```typescript
async listAgentDefinitions(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getRunNodeEvents`

```typescript
async getRunNodeEvents(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getLatestCompletedRunBlackboard`

```typescript
async getLatestCompletedRunBlackboard(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getAgentSessionRuntimeState`

```typescript
async getAgentSessionRuntimeState(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getAgentSessionByExternalId`

```typescript
async getAgentSessionByExternalId(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getAgentRunRuntimeState`

```typescript
async getAgentRunRuntimeState(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getAgentRunInternalId`

```typescript
async getAgentRunInternalId(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getAgentDefinition`

```typescript
async getAgentDefinition(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `getAgentDefinitionByInternalId`

```typescript
async getAgentDefinitionByInternalId(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `findAgentRunByDeduplicationKey`

```typescript
async findAgentRunByDeduplicationKey(ctx: any, query: any): Promise<any>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

#### `findAgentDefinitionByNameAndScope`

```typescript
async findAgentDefinitionByNameAndScope(ctx: any, query: any): Promise<unknown>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| query | `any` | - |

### src/commands/vector

#### `upsertChunkVectors`

```typescript
async upsertChunkVectors(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `updateVectorDimension`

```typescript
async updateVectorDimension(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `ensureVectorStorageSchema`

```typescript
async ensureVectorStorageSchema(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/translation

#### `upsertTranslationVote`

```typescript
async upsertTranslationVote(ctx: any, command: any): Promise<{ result: unknown; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `unapproveTranslation`

```typescript
async unapproveTranslation(ctx: any, command: any): Promise<{ result: undefined; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `deleteTranslation`

```typescript
async deleteTranslation(ctx: any, command: any): Promise<{ result: undefined; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createTranslations`

```typescript
async createTranslations(ctx: any, command: any): Promise<{ result: any; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `autoApproveDocumentTranslations`

```typescript
async autoApproveDocumentTranslations(ctx: any, command: any): Promise<{ result: any; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `approveTranslation`

```typescript
async approveTranslation(ctx: any, command: any): Promise<{ result: undefined; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/user

#### `updateUser`

```typescript
async updateUser(ctx: any, command: any): Promise<{ result: unknown; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `updateUserAvatar`

```typescript
async updateUserAvatar(ctx: any, command: any): Promise<{ result: undefined; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createUser`

```typescript
async createUser(ctx: any, command: any): Promise<{ result: unknown; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/session

#### `revokeSessionRecord`

```typescript
async revokeSessionRecord(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createSessionRecord`

```typescript
async createSessionRecord(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/string

#### `createTranslatableStrings`

```typescript
async createTranslatableStrings(ctx: any, command: any): Promise<{ result: any; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createChunkSet`

```typescript
async createChunkSet(ctx: any, _command: any): Promise<{ result: unknown; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| _command | `any` | - |

### src/commands/qa

#### `createQaResult`

```typescript
async createQaResult(ctx: any, command: any): Promise<{ result: { id: any; }; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createQaResultWithItems`

```typescript
async createQaResultWithItems(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createQaResultItems`

```typescript
async createQaResultItems(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/setting

#### `setSetting`

```typescript
async setSetting(ctx: any, command: any): Promise<{ result: undefined; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/project

#### `updateProject`

```typescript
async updateProject(ctx: any, command: any): Promise<{ result: unknown; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `unlinkProjectMemories`

```typescript
async unlinkProjectMemories(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `unlinkProjectGlossaries`

```typescript
async unlinkProjectGlossaries(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `linkProjectMemories`

```typescript
async linkProjectMemories(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `linkProjectGlossaries`

```typescript
async linkProjectGlossaries(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `deleteProject`

```typescript
async deleteProject(ctx: any, command: any): Promise<{ result: undefined; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createProject`

```typescript
async createProject(ctx: any, command: any): Promise<{ result: unknown; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createProjectTranslationSnapshot`

```typescript
async createProjectTranslationSnapshot(ctx: any, command: any): Promise<{ result: any; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `addProjectTargetLanguages`

```typescript
async addProjectTargetLanguages(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/plugin

#### `upsertPluginConfigInstance`

```typescript
async upsertPluginConfigInstance(ctx: any, command: any): Promise<{ result: unknown; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `updatePluginConfigInstanceValue`

```typescript
async updatePluginConfigInstanceValue(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `uninstallPlugin`

```typescript
async uninstallPlugin(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `syncPluginServices`

```typescript
async syncPluginServices(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `registerPluginDefinition`

```typescript
async registerPluginDefinition(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `installPlugin`

```typescript
async installPlugin(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `deletePluginServices`

```typescript
async deletePluginServices(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/permission

#### `seedSystemRoles`

幂等地确保 4 个系统角色存在于数据库中。
使用 INSERT ... ON CONFLICT DO NOTHING。

```typescript
async seedSystemRoles(ctx: any, _command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| _command | `any` | - |

#### `revokePermissionTuple`

删除权限关系元组。元组不存在时静默完成（幂等）。

```typescript
async revokePermissionTuple(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `insertAuditLogs`

批量插入鉴权审计日志。写入失败时静默忽略，不影响业务流程。

```typescript
async insertAuditLogs(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `grantPermissionTuple`

插入权限关系元组，已存在则忽略（幂等）。

```typescript
async grantPermissionTuple(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `grantFirstUserSuperadmin`

检查是否为首位注册用户：若是，自动授予 system#superadmin 权限元组，
并将 setting "system:first_user_registered" 置为 true。

性能优化：只查一次 setting（O(1)），不走 count(*)。
幂等：若 setting 已存在则直接返回。

```typescript
async grantFirstUserSuperadmin(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/memory

#### `createMemory`

```typescript
async createMemory(ctx: any, command: any): Promise<{ result: unknown; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createMemoryItems`

```typescript
async createMemoryItems(ctx: any, command: any): Promise<{ result: any; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/login-attempt

#### `insertLoginAttempt`

```typescript
async insertLoginAttempt(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/language

#### `ensureLanguages`

```typescript
async ensureLanguages(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/file

#### `createOrReferenceBlobAndFile`

```typescript
async createOrReferenceBlobAndFile(ctx: any, command: any): Promise<{ result: { blobId: any; fileId: any; referenceCount: any; }; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createBlobAndFile`

```typescript
async createBlobAndFile(ctx: any, command: any): Promise<{ result: { blobId: any; fileId: any; }; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `activateFile`

```typescript
async activateFile(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `rollbackBlobAndFile`

```typescript
async rollbackBlobAndFile(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `deleteBlobAndFile`

```typescript
async deleteBlobAndFile(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `finalizePresignedFile`

```typescript
async finalizePresignedFile(ctx: any, command: any): Promise<{ result: { conflicted: boolean; }; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createFile`

```typescript
async createFile(ctx: any, command: any): Promise<{ result: unknown; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createBlob`

```typescript
async createBlob(ctx: any, command: any): Promise<{ result: unknown; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/glossary

#### `updateGlossaryConcept`

```typescript
async updateGlossaryConcept(ctx: any, command: any): Promise<{ result: { updated: boolean; glossaryId: any; }; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `setConceptStringId`

```typescript
async setConceptStringId(ctx: any, command: any): Promise<{ result: { updated: boolean; }; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `deleteGlossaryTerm`

```typescript
async deleteGlossaryTerm(ctx: any, command: any): Promise<{ result: { deleted: boolean; conceptId: any; glossaryId: any; }; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createGlossary`

```typescript
async createGlossary(ctx: any, command: any): Promise<{ result: unknown; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createGlossaryTerms`

```typescript
async createGlossaryTerms(ctx: any, command: any): Promise<{ result: { termIds: any; conceptIds: number[]; }; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createGlossaryConcept`

```typescript
async createGlossaryConcept(ctx: any, command: any): Promise<{ result: unknown; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createGlossaryConceptSubject`

```typescript
async createGlossaryConceptSubject(ctx: any, command: any): Promise<{ result: unknown; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `addGlossaryTermToConcept`

```typescript
async addGlossaryTermToConcept(ctx: any, command: any): Promise<{ result: { termId: any; conceptId: any; glossaryId: any; }; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/element

#### `deleteElementsByIds`

```typescript
async deleteElementsByIds(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createElements`

```typescript
async createElements(ctx: any, command: any): Promise<{ result: any; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `bulkUpdateElementsForDiff`

```typescript
async bulkUpdateElementsForDiff(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/document

#### `deleteDocument`

```typescript
async deleteDocument(ctx: any, command: any): Promise<{ result: undefined; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createVectorizedChunks`

```typescript
async createVectorizedChunks(ctx: any, command: any): Promise<{ result: { chunkSetIds: any; chunkIds: any; }; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createRootDocument`

```typescript
async createRootDocument(ctx: any, command: any): Promise<{ result: unknown; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createDocumentUnderParent`

Create a new document under the given parent in the closure-table tree.
If `parentId` is null, the project root document is used as the parent.

```typescript
async createDocumentUnderParent(drizzle: Omit<DrizzleClient, "$client">, input: { name: string; projectId: string; creatorId: string; isDirectory?: boolean; fileId?: number | null; fileHandlerId?: number | null; }, parentId: string | null): Promise<{ id: string; name: string | null; projectId: string; creatorId: string; fileHandlerId: number | null; fileId: number | null; isDirectory: boolean; createdAt: Date; updatedAt: Date; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| drizzle | `Omit<DrizzleClient, "$client">` | - |
| input | `{ name: string; projectId: string; creatorId: string; isDirectory?: boolean; fileId?: number | null; fileHandlerId?: number | null; }` | - |
| parentId | `string | null` | - |

#### `bulkUpdateChunkVectorMetadata`

```typescript
async bulkUpdateChunkVectorMetadata(ctx: any, command: any): Promise<{ result: { updatedCount: any; }; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/auth

#### `registerUserWithPasswordAccount`

```typescript
async registerUserWithPasswordAccount(ctx: any, command: any): Promise<{ result: { userId: any; providerIssuer: any; providedAccountId: any; }; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createMfaProvider`

```typescript
async createMfaProvider(ctx: any, command: any): Promise<{ result: unknown; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createAccount`

```typescript
async createAccount(ctx: any, command: any): Promise<{ result: unknown; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/comment

#### `upsertCommentReaction`

```typescript
async upsertCommentReaction(ctx: any, command: any): Promise<{ result: unknown; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `deleteComment`

```typescript
async deleteComment(ctx: any, command: any): Promise<{ result: undefined; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `deleteCommentReaction`

```typescript
async deleteCommentReaction(ctx: any, command: any): Promise<{ result: undefined; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createComment`

```typescript
async createComment(ctx: any, command: any): Promise<{ result: unknown; events: any[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/api-key

#### `updateApiKeyLastUsed`

```typescript
async updateApiKeyLastUsed(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `revokeApiKey`

```typescript
async revokeApiKey(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createApiKey`

```typescript
async createApiKey(ctx: any, command: any): Promise<{ result: { id: any; }; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

### src/commands/agent

#### `updateAgentDefinition`

```typescript
async updateAgentDefinition(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `saveAgentRunSnapshot`

```typescript
async saveAgentRunSnapshot(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `saveAgentRunMetadata`

```typescript
async saveAgentRunMetadata(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `saveAgentExternalOutput`

```typescript
async saveAgentExternalOutput(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `saveAgentEvent`

```typescript
async saveAgentEvent(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `deleteAgentDefinition`

```typescript
async deleteAgentDefinition(ctx: any, command: any): Promise<{ result: undefined; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createAgentSession`

```typescript
async createAgentSession(ctx: any, command: any): Promise<{ result: { sessionId: any; }; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |

#### `createAgentDefinition`

```typescript
async createAgentDefinition(ctx: any, command: any): Promise<{ result: { id: any; }; events: never[]; }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| ctx | `any` | - |
| command | `any` | - |


*Last updated: 2026-04-02*