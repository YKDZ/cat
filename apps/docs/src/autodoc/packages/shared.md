# @cat/shared

Shared Zod schemas, type definitions, and utility functions

## Overview

- **Modules**: 38
- **Exported functions**: 23
- **Exported types**: 123

## Function Index

### src

*No exported functions*

### src/utils

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `safeJoinURL` | base, path | `string` | - |
| `toShortFixed` | num, fractionDigits | `string` | - |
| `parsePreferredLanguage` | acceptLanguage | `string | null` | - |
| `useStringTemplate` | template, ctx | `string` | - |
| `summarize` | obj | `unknown` | 辅助函数：折叠大对象用于日志输出
- 数组显示为 Array(N)
- 对象显示为 {Object}
- 长字符串截断 |
| `getDefaultFromSchema` | schema | `any` | - |
| `createHTTPHelpers` | req, resHeaders | `{ setCookie: setCookie; delCookie: delCookie; getCookie: getCookie; getQueryParam: getQueryParam; getReqHeader: getReqHeader; setResHeader: setResHeader; }` | - |
| `getCookieFunc` | cookies | `getCookie` | - |
| `getQueryParamFunc` | url | `getQueryParam` | - |
| `sanitizeFileName` | name | `string` | - |
| `summarizeError` | error | `unknown` | - |
| `assertFirstOrNull` | arr, message? | `T | null` | - |
| `assertSingleOrNull` | arr, message? | `T | null` | - |
| `assertPromise` | predicate, message | `Promise<void>` | Assert that the given async predicate resolves successfully. \
If it rejects, throw an AssertError with the given message and the original error as leadTo. |
| `assertFirstNonNullish` | arr, message? | `T` | - |
| `assertSingleNonNullish` | arr, message? | `T` | - |
| `assertKeysNonNullish` | obj, keys, message? | `void` | - |
| `chunkGenerator` | arr, size | `Generator<T[], any, any>` | - |
| `dualChunkGenerator` | arr1, arr2, size | `Generator<[A[], B[]], any, any>` | - |
| `chunk` | arr, size | `{ index: number; chunk: T[]; }[]` | - |
| `chunkDual` | arr1, arr2, size | `{ index: number; chunk: { arr1: A[]; arr2: B[]; }; }[]` | - |
| `getIndex` | arr, index | `T` | - |
| `zip` | arrays | `Iterable<RowOf<T>>` | 输入任意个长度相同的数组 a, b, c...
输出由每个数组同一位置元素组成的数组的迭代器 |

### src/schema

*No exported functions*

### src/utils/logger

*No exported functions*

### src/schema/drizzle

*No exported functions*

## Type Index

| Type | Kind | Description |
|------|------|-------------|
| `setCookie` | type | - |
| `delCookie` | type | - |
| `getCookie` | type | - |
| `getQueryParam` | type | - |
| `getReqHeader` | type | - |
| `setResHeader` | type | - |
| `HTTPHelpers` | type | - |
| `TermMatch` | type | - |
| `ConceptContext` | type | - |
| `EnrichedTermMatch` | type | - |
| `TranslationAdvise` | type | - |
| `PluginManifest` | type | - |
| `PluginData` | type | - |
| `TranslationSuggestion` | type | - |
| `PermissionCheck` | type | - |
| `GrantPermission` | type | - |
| `NlpToken` | type | - |
| `NlpSentence` | type | - |
| `NlpSegmentResult` | type | - |
| `NlpBatchSegmentResult` | type | - |
| `FileMeta` | type | - |
| `TranslatableElementData` | type | - |
| `ElementTranslationStatus` | type | - |
| `MemorySuggestion` | type | - |
| `AdaptationMethod` | type | - |
| `TranslationSuggestionStatus` | type | - |
| `UnvectorizedTextData` | type | - |
| `VectorizedTextData` | type | - |
| `TermData` | type | - |
| `AuthMethod` | type | - |
| `TranslationAdvisorData` | type | - |
| `JSONObject` | interface | - |
| `JSONSchema` | type | - |
| `_JSONSchema` | type | - |
| `JSONType` | type | - |
| `JSONArray` | type | - |
| `NonNullJSONType` | type | - |
| `AgentDefinition` | type | - |
| `AgentLLMConfig` | type | - |
| `SystemPromptVariable` | type | - |
| `AgentConstraints` | type | - |
| `PipelineStage` | type | - |
| `Orchestration` | type | - |
| `ToolConfirmRequest` | type | - |
| `ToolConfirmResponse` | type | - |
| `ToolExecuteRequest` | type | - |
| `ToolExecuteResponse` | type | - |
| `ConfirmationPolicy` | type | - |
| `LogEntry` | interface | - |
| `LoggerTransport` | interface | - |
| `LogLevel` | type | - |
| `OutputSituation` | type | - |
| `ChunkSet` | type | - |
| `Chunk` | type | - |
| `Vector` | type | - |
| `User` | type | - |
| `Account` | type | - |
| `MFAProvider` | type | - |
| `Translation` | type | - |
| `TranslationVote` | type | - |
| `TranslationSnapshot` | type | - |
| `TranslationSnapshotItem` | type | - |
| `QaResult` | type | - |
| `QaResultItem` | type | - |
| `Project` | type | - |
| `ProjectTargetLanguage` | type | - |
| `Plugin` | type | - |
| `PluginInstallation` | type | - |
| `PluginConfig` | type | - |
| `PluginConfigInstance` | type | - |
| `PluginService` | type | - |
| `PluginComponent` | type | - |
| `PluginPermission` | type | - |
| `PluginVersion` | type | - |
| `Language` | type | - |
| `Task` | type | - |
| `Setting` | type | - |
| `SlotMappingEntry` | type | - |
| `Memory` | type | - |
| `MemoryItem` | type | - |
| `MemoryToProject` | type | - |
| `Glossary` | type | - |
| `GlossaryToProject` | type | - |
| `Term` | type | - |
| `TermConcept` | type | - |
| `TermConceptToSubject` | type | - |
| `TermConceptSubject` | type | - |
| `File` | type | - |
| `Blob` | type | - |
| `TokenType` | type | - |
| `PluginServiceType` | type | - |
| `ScopeType` | type | - |
| `TaskStatus` | type | - |
| `TranslatableElementContextType` | type | - |
| `CommentReactionType` | type | - |
| `ResourceType` | type | - |
| `CommentTargetType` | type | - |
| `TermType` | type | - |
| `TermStatus` | type | - |
| `AgentSessionStatus` | type | - |
| `ObjectType` | type | - |
| `SubjectType` | type | - |
| `Relation` | type | - |
| `PermissionAction` | type | - |
| `AgentToolTarget` | type | - |
| `AgentToolConfirmationStatus` | type | - |
| `AgentSessionTrustPolicy` | type | - |
| `AgentDefinitionType` | type | - |
| `Document` | type | - |
| `DocumentClosure` | type | - |
| `DocumentToTask` | type | - |
| `TranslatableElement` | type | - |
| `TranslatableString` | type | - |
| `TranslatableElementContext` | type | - |
| `Comment` | type | - |
| `CommentReaction` | type | - |
| `ApiKey` | type | - |
| `SessionRecord` | type | - |
| `AgentDefinition` | type | - |
| `AgentSession` | type | - |
| `AgentRun` | type | - |
| `AgentEvent` | type | - |
| `AgentExternalOutput` | type | - |


*Last updated: 2026-04-02*