# @cat/plugin-core

Plugin system core: service registry, component registry, discovery

## Overview

* **Modules**: 25

* **Exported functions**: 15

* **Exported types**: 75

## Function Index

### packages/plugin-core/src/client/sce

### `createDocumentDistortion`

```ts
export const createDocumentDistortion = (pluginId: string, _win: Window): Distortion
```

### `createElementDistortion`

```ts
export const createElementDistortion = (_win: Window): Distortion
```

### `createNodeDistortion`

```ts
export const createNodeDistortion = (win: Window): Distortion
```

### `createPrototypeDistortion`

```ts
export const createPrototypeDistortion = (win: Window): Distortion
```

### `createVueDistortion`

```ts
export const createVueDistortion = (): Distortion
```

### `createFetchDistortion`

```ts
export const createFetchDistortion = (pluginId: string, win: Window): Distortion
```

### `unwrap`

```ts
export function unwrap(value: unknown): unknown
```

### `basicSandboxGlobal`

```ts
export const basicSandboxGlobal = (win: Window): SandboxGlobal
```

### `safeCustomElements`

```ts
export const safeCustomElements = (registry: Map<
    string,
    {
      constructor: CustomElementConstructor;
      options?: ElementDefinitionOptions;
    }
  >): Partial<CustomElementRegistry>
```

### `createSandbox`

```ts
export function createSandbox(pluginId: string, win: Window, options: SandboxOptions): { evaluate: (code: string) => void; }
```

### `setupDefaultDistortions`

```ts
export const setupDefaultDistortions: DistortionSetup = (membrane: Membrane, pluginId: string, win: Window) => {...}
```

### packages/plugin-core/src/utils

### `getPluginConfig`

```ts
export const getPluginConfig = async (drizzle: DbHandle, pluginId: string, scopeType: ScopeType, scopeId: string): Promise<JSONType>
```

### `getConfigInstance`

```ts
export const getConfigInstance = async (drizzle: DbHandle, pluginId: string, scopeType: ScopeType, scopeId: string): Promise<JSONType>
```

### `tokenize`

```ts
export const tokenize = async (text: string, rules: { rule: Tokenizer; id: number }[], options?: TokenizeOptions): Promise<Token[]>
```

### `parseInner`

```ts
/**
 * 解析子内容
 * @param 子文本内容
 * @param 子文本在父文本中的起始位置
 *
 * @param content - 子文本内容
 * @param offsetInParent - 子文本在父文本中的起始位置
 */
export const parseInner = async (content: string, offsetInParent: number, rules: { rule: Tokenizer; id: number }[], options?: TokenizeOptions): Promise<Token[]>
```

## Type Index

* `SandboxOptions` (interface)

* `DistortionSetup` (type)

* `GlobalContextBuilder` (type)

* `SandboxGlobal` (interface)

* `Distortion` (interface)

* `MembraneOptions` (interface)

* `DistortionHandler` (type)

* `DistortionSetter` (type)

* `RealmSide` (type)

* `CatPlugin` (interface) — 插件核心接口
  所有的函数都应该是纯函数或副作用可控的工厂函数

* `PluginAuthContext` (type) — 插件鉴权上下文
  用于在 capability 层做权限拦截

* `PluginContext` (type) — 插件运行时上下文
  包含当前插件的配置、已注册的服务以及当前所处的作用域信息

* `RouteContext` (type)

* `ComponentRecord` (type)

* `ComponentData` (type)

* `PluginLoader` (interface)

* `RegisteredService` (type)

* `AgentContextProvider` (interface) — Agent 上下文提供器插件服务接口。

  每个 provider 声明：
  1\. 自己能提供哪些变量（provides）
  2\. 自己依赖哪些已有变量（dependencies）
  3\. 解析逻辑（resolve）

  系统通过拓扑排序按顺序调用所有 provider 的 resolve，
  将产出的变量累积到同一个 Map 中。

* `ContextVariableMeta` (type)

* `ContextProviderDependency` (type)

* `ContextResolveContext` (type) — 解析上下文，传递给 provider 的 resolve 方法。
  包含当前已解析的变量 map 和数据库客户端以支持查询。

* `AgentToolProviderToolDef` (interface) — A single tool definition provided by an AGENT\_TOOL\_PROVIDER plugin service.

* `AgentToolProvider` (interface) — Plugin service interface for providing custom agent tools.
  Plugins implementing \`AGENT\_TOOL\_PROVIDER\` register additional tools
  that the agent can use during execution.

* `AgentToolConfirmationPolicy` (type) — Confirmation policy for agent tools. Controls whether the user
  must approve execution before the tool runs.

* `AgentToolTarget` (type) — Where the tool executes.
  \- \`server\` — Backend execution (default).
  \- \`client\` — Frontend (browser) execution via streaming protocol.

* `AuthFactorAAL` (type) — Authentication Assurance Level:
  \- 1: single factor (e.g. password)
  \- 2: multi-factor (e.g. password + TOTP)

* `AuthFactorInput` (type) — Input provided by the user for this factor's challenge.

* `AuthFactorResult` (type) — Result of executing an auth factor.

* `AuthFactorExecutionContext` (type) — Context passed to an AUTH\_FACTOR when it executes.

* `CanImportContext` (type)

* `ImportContext` (type)

* `CanExportContext` (type)

* `ExportContext` (type)

* `ElementLocation` (type)

* `ElementData` (type)

* `ChatMessageRole` (type)

* `ChatMessage` (type)

* `ToolDefinition` (type)

* `ToolCall` (type)

* `ChatCompletionRequest` (type)

* `ChatStreamChunk` (type)

* `ChatCompletionFinishReason` (type)

* `ChatCompletionUsage` (type)

* `ChatCompletionResponse` (type)

* `NlpSegmentContext` (type) — 分词请求上下文

* `NlpBatchSegmentContext` (type) — 批量分词请求上下文

* `QAIssue` (interface)

* `CheckContext` (interface) — QA 上下文

* `QASeverity` (type)

* `IPluginService` (interface)

* `PutStreamContext` (type)

* `GetStreamContext` (type)

* `GetRangeContext` (type)

* `GetPresignedPutUrlContext` (type)

* `GetPresignedGetUrlContext` (type)

* `HeadContext` (type)

* `DeleteContext` (type)

* `CanVectorizeContext` (type)

* `VectorizeContext` (type)

* `Token` (interface)

* `ParserContext` (interface)

* `ParseResult` (type)

* `TokenizerPriority` (enum)

* `GetSuggestionsContext` (type)

* `StoreContext` (type)

* `RetrieveContext` (type)

* `CosineSimilarityContext` (type)

* `InitContext` (type)

* `UpdateDimensionContext` (type)

* `PluginServiceTypeMap` (type)

* `PluginServiceMap` (type)

* `TokenizeOptions` (interface)
