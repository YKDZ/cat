# Server Shared Module

> **Section**: Infra  ·  **Subject ID**: `infra/server-shared`

**Primary package**: `@cat/server-shared`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `hash` | function |  |
| `putBufferToStorage` | function |  |
| `preparePresignedPutFile` | function |  |
| `getDownloadUrl` | function |  |
| `finishPresignedPutFile` | function |  |
| `PresignedPutFileSessionPayload` | type |  |
| `FileDownloadPayload` | type |  |
| `createHTTPHelpers` | function |  |
| `collectLLMResponse` | function | Consume an LLM AsyncIterable chunk stream and aggregate all chunks into
a single |
| `CollectedLLMResponse` | interface | The complete response collected from an LLM stream. |
| `detectMobile` | function | 尝试从 Node.js HTTP 请求头判断客户端是否为手机。 |
| `detectMobileFromRequest` | function | 尝试从 Web API Request 请求头判断客户端是否为手机。
可在 SSR 环境中直接使用（包括 Vite dev 模式）。 |
| `hashPassword` | function |  |
| `verifyPassword` | function |  |
| `firstOrGivenService` | function |  |
| `getServiceFromDBId` | function | 不涉及插件函数调用，可以在事务中安全调用 |
| `resolvePluginComponentPath` | function | 找到指定组件在本地插件目录中的位置 |
| `initAllVectorStorage` | function |  |
| `resolvePluginManager` | function |  |
| `readableToBuffer` | function |  |
| `readableToString` | function |  |
| `hashFromReadable` | function |  |
| `userFromSessionId` | function |  |
| `setVectorizationQueue` | function | Set the global vectorization task queue instance. Should be called once during a |
| `getVectorizationQueue` | function | Get the global vectorization task queue instance. |
| `VectorizationTask` | type | Payload type for a vectorization task. |
