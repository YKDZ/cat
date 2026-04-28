# @cat/server-shared

Shared server utilities

## Overview

* **Modules**: 10

* **Exported functions**: 22

* **Exported types**: 4

## Function Index

### packages/server-shared/src

### `hash`

```ts
export const hash = (obj: object, algorithm: string, encoding: BinaryToTextEncoding): string
```

### `putBufferToStorage`

```ts
export const putBufferToStorage = async (drizzle: DbHandle, storageProvider: StorageProvider, storageProviderId: number, buffer: Buffer, key: string, name: string): Promise<{ fileId: number; blobId: number; }>
```

### `preparePresignedPutFile`

```ts
export const preparePresignedPutFile = async (drizzle: DbHandle, sessionStore: SessionStore, storage: StorageProvider, storageId: number, key: string, name: string, ctxHash: string, expiresInSeconds: number): Promise<{ url: string; putSessionId: string; fileId: number; }>
```

### `getDownloadUrl`

```ts
export const getDownloadUrl = async (sessionStore: SessionStore, storageProvider: StorageProvider, storageProviderId: number, key: string, expiresInSeconds: number, filename?: string): Promise<string>
```

### `finishPresignedPutFile`

```ts
export const finishPresignedPutFile = async (drizzle: DbHandle, sessionStore: SessionStore, pluginManager: PluginManager, putSessionId: string, ctxHash: string): Promise<number>
```

### `createHTTPHelpers`

```ts
export const createHTTPHelpers = (req: IncomingMessage, res: ServerResponse): { setCookie: setCookie; delCookie: delCookie; getCookie: getCookie; getQueryParam: getQueryParam; getReqHeader: getReqHeader; setResHeader: setResHeader; }
```

### `collectLLMResponse`

```ts
/**
 * Consume an LLM AsyncIterable chunk stream and aggregate all chunks into
 * a single complete response object. Throws if an error chunk is encountered.
 */
export const collectLLMResponse = async (stream: AsyncIterable<LLMChunk>): Promise<CollectedLLMResponse>
```

### `detectMobile`

```ts
/**
 * 尝试从 Node.js HTTP 请求头判断客户端是否为手机。
 */
export function detectMobile(req: IncomingMessage): boolean
```

### `detectMobileFromRequest`

```ts
/**
 * 尝试从 Web API Request 请求头判断客户端是否为手机。
 * 可在 SSR 环境中直接使用（包括 Vite dev 模式）。
 */
export function detectMobileFromRequest(req: Request): boolean
```

### `hashPassword`

```ts
export const hashPassword = async (password: string): Promise<string>
```

### `verifyPassword`

```ts
export const verifyPassword = async (password: string, storedSaltHash: string): Promise<boolean>
```

### `firstOrGivenService`

```ts
export const firstOrGivenService = (pluginManager: PluginManager, type: T, id?: number): { id: number; service: PluginServiceMap[T]; } | undefined
```

### `getServiceFromDBId`

```ts
/**
 * 不涉及插件函数调用，可以在事务中安全调用
 */
export const getServiceFromDBId = (pluginManager: PluginManager, id: number): T
```

### `resolvePluginComponentPath`

```ts
/**
 * 找到指定组件在本地插件目录中的位置
 */
export const resolvePluginComponentPath = (pluginManager: PluginManager, pluginId: string, componentName: string): string
```

### `initAllVectorStorage`

```ts
export const initAllVectorStorage = async (pluginManager: PluginManager): Promise<void>
```

### `resolvePluginManager`

```ts
export const resolvePluginManager = (maybePluginManager: unknown): PluginManager
```

### `readableToBuffer`

```ts
export async function readableToBuffer(stream: Readable | AsyncIterable<string | Uint8Array<ArrayBufferLike>>): Promise<Buffer<ArrayBufferLike>>
```

### `readableToString`

```ts
export const readableToString = async (stream: Readable, encode: BufferEncoding): Promise<string>
```

### `hashFromReadable`

```ts
export const hashFromReadable = async (stream: Readable, algorithm: string): Promise<Buffer<ArrayBufferLike>>
```

### `userFromSessionId`

```ts
export const userFromSessionId = async (drizzle: DbHandle, sessionId: string | null): Promise<{ id: string; name: string; email: string; emailVerified: boolean; avatarFileId: number | null; createdAt: Date; updatedAt: Date; } | null>
```

### `setVectorizationQueue`

```ts
/**
 * Set the global vectorization task queue instance. Should be called once during app bootstrap.
 */
export const setVectorizationQueue = (q: TaskQueue<VectorizationTask>)
```

### `getVectorizationQueue`

```ts
/**
 * Get the global vectorization task queue instance.
 */
export const getVectorizationQueue = (): TaskQueue<VectorizationTask>
```

## Type Index

* `PresignedPutFileSessionPayload` (type)

* `FileDownloadPayload` (type)

* `CollectedLLMResponse` (interface) — The complete response collected from an LLM stream.

* `VectorizationTask` (type) — Payload type for a vectorization task.
