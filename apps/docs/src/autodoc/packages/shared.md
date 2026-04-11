# @cat/shared

Shared Zod schemas, type definitions, and utility functions

## Overview

* **Modules**: 35

* **Exported functions**: 24

* **Exported types**: 145

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

* `Orchestration` (type) — Multi-agent orchestration configuration type.

* `PipelineStage` (type) — Orchestration pipeline stage type.

* `AgentDefinition` (type) — @deprecated Use AgentDefinitionMetadata instead.

* `SystemPromptVariable` (type) — @deprecated Use ParsedAgentDefinition instead.

* `ToolConfirmRequest` (type)

* `ToolConfirmResponse` (type)

* `ToolExecuteRequest` (type)

* `ToolExecuteResponse` (type)

* `ConfirmationPolicy` (type)

* `AgentDefinition` (type)

* `AgentSession` (type)

* `AgentRun` (type)

* `AgentEvent` (type)

* `AgentExternalOutput` (type)

* `ApiKey` (type)

* `SessionRecord` (type)

* `Changeset` (type)

* `ChangesetEntry` (type)

* `EntitySnapshot` (type)

* `Comment` (type)

* `CommentReaction` (type)

* `Document` (type)

* `DocumentClosure` (type)

* `DocumentToTask` (type)

* `TranslatableElement` (type)

* `VectorizedString` (type)

* `TranslatableElementContext` (type)

* `File` (type)

* `Blob` (type)

* `Glossary` (type)

* `GlossaryToProject` (type)

* `Term` (type)

* `TermConcept` (type)

* `TermConceptToSubject` (type)

* `TermConceptSubject` (type)

* `KanbanBoard` (type)

* `KanbanCard` (type)

* `KanbanCardDep` (type)

* `SlotMappingEntry` (type)

* `Memory` (type)

* `MemoryItem` (type)

* `MemoryToProject` (type)

* `Language` (type)

* `Task` (type)

* `Setting` (type)

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

* `QaResult` (type)

* `QaResultItem` (type)

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

* `TokenType` (type)

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

* `KanbanCardStatus` (type)

* `ChangesetStatus` (type)

* `EntityType` (type)

* `ChangeAction` (type)

* `RiskLevel` (type)

* `ReviewStatus` (type)

* `AsyncStatus` (type)

* `ChangesetEntryAsyncStatus` (type)

* `JSONObject` (interface)

* `JSONSchema` (type)

* `_JSONSchema` (type)

* `JSONType` (type)

* `JSONArray` (type)

* `NonNullJSONType` (type)

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
