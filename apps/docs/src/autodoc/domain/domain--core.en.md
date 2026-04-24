# Domain Core Model

> **Section**: Domain Model  ·  **Subject ID**: `domain/core`

**Primary package**: `@cat/domain`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `generateCacheKey` | function | 生成输入数据的哈希值作为缓存键 |
| `initCacheStore` | function | 初始化缓存存储 |
| `getCacheStore` | function | 获取缓存存储实例 |
| `initSessionStore` | function | 初始化会话存储 |
| `getSessionStore` | function | 获取会话存储实例 |
| `withCache` | function | 带缓存的高阶函数包装器
包装一个异步函数，使其自动使用缓存 |
| `CacheStore` | interface | 缓存存储接口 |
| `SessionStore` | interface | 会话存储接口（基于 Hash 结构） |
| `CacheOptions` | type | 缓存配置选项 |
| `createPluginCapabilities` | function |  |
| `ProjectCapabilities` | type |  |
| `DocumentCapabilities` | type |  |
| `TranslationCapabilities` | type |  |
| `SettingCapabilities` | type |  |
| `AuthCapabilities` | type |  |
| `VectorCapabilities` | type |  |
| `LanguageCapabilities` | type |  |
| `UserCapabilities` | type |  |
| `CommentCapabilities` | type |  |
| `AgentCapabilities` | type |  |
| `ElementCapabilities` | type |  |
| `QaCapabilities` | type |  |
| `GlossaryCapabilities` | type |  |
| `MemoryCapabilities` | type |  |
| `PluginCapabilities` | type |  |
| `completeAgentSession` | function | Mark an AgentSession as a terminal state (COMPLETED / FAILED / CANCELLED). |
| `CompleteAgentSessionCommand` | type |  |
| `createAgentDefinition` | function |  |
| `CreateAgentDefinitionCommand` | type |  |
| `createAgentRun` | function | Create a new AgentRun and update AgentSession.currentRunId. |
| `CreateAgentRunCommand` | type |  |
| `CreateAgentRunResult` | type |  |
| `createAgentSession` | function |  |
| `CreateAgentSessionCommand` | type |  |
| `deleteAgentDefinition` | function |  |
| `DeleteAgentDefinitionCommand` | type |  |
| `finishAgentRun` | function | Update AgentRun status to a terminal state and record completion time. |
| `FinishAgentRunCommand` | type |  |
| `saveAgentEvent` | function |  |
| `SaveAgentEventCommand` | type |  |
| `saveAgentExternalOutput` | function |  |
| `SaveAgentExternalOutputCommand` | type |  |
| `saveAgentRunMetadata` | function |  |
| `SaveAgentRunMetadataCommand` | type |  |
| `saveAgentRunSnapshot` | function |  |
| `SaveAgentRunSnapshotCommand` | type |  |
| `updateAgentDefinition` | function |  |
| `UpdateAgentDefinitionCommand` | type |  |
| `createApiKey` | function |  |
| `CreateApiKeyCommand` | interface |  |
| *(714 more)* | | |
