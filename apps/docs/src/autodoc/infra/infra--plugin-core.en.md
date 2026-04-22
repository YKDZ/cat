# Plugin Core Interface

> **Section**: Infra  ·  **Subject ID**: `infra/plugin-core`

**Primary package**: `@cat/plugin-core`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `createDocumentDistortion` | function |  |
| `createElementDistortion` | function |  |
| `createNodeDistortion` | function |  |
| `createPrototypeDistortion` | function |  |
| `createVueDistortion` | function |  |
| `createFetchDistortion` | function |  |
| `unwrap` | function |  |
| `basicSandboxGlobal` | function |  |
| `safeCustomElements` | function |  |
| `createSandbox` | function |  |
| `setupDefaultDistortions` | function |  |
| `SandboxOptions` | interface |  |
| `DistortionSetup` | type |  |
| `GlobalContextBuilder` | type |  |
| `SandboxGlobal` | interface |  |
| `Distortion` | interface |  |
| `MembraneOptions` | interface |  |
| `DistortionHandler` | type |  |
| `DistortionSetter` | type |  |
| `RealmSide` | type |  |
| `CatPlugin` | interface | 插件核心接口
所有的函数都应该是纯函数或副作用可控的工厂函数 |
| `PluginAuthContext` | type | 插件鉴权上下文
用于在 capability 层做权限拦截 |
| `PluginContext` | type | 插件运行时上下文
包含当前插件的配置、已注册的服务以及当前所处的作用域信息 |
| `RouteContext` | type |  |
| `ComponentRecord` | type |  |
| `ComponentData` | type |  |
| `PluginLoader` | interface |  |
| `RegisteredService` | type |  |
| `AgentContextProvider` | interface | Agent 上下文提供器插件服务接口。

每个 provider 声明：
1. 自己能提供哪些变量（provides）
2. 自己依赖哪些已有变量（depend |
| `ContextVariableMeta` | type |  |
| `ContextProviderDependency` | type |  |
| `ContextResolveContext` | type | 解析上下文，传递给 provider 的 resolve 方法。
包含当前已解析的变量 map 和数据库客户端以支持查询。 |
| `AgentToolProviderToolDef` | interface | A single tool definition provided by an AGENT_TOOL_PROVIDER plugin service. |
| `AgentToolProvider` | interface | Plugin service interface for providing custom agent tools.
Plugins implementing  |
| `AgentToolConfirmationPolicy` | type | Confirmation policy for agent tools. Controls whether the user
must approve exec |
| `AgentToolTarget` | type | Where the tool executes.
- `server` — Backend execution (default).
- `client` —  |
| `AuthFactorAAL` | type | Authentication Assurance Level:
- 1: single factor (e.g. password)
- 2: multi-fa |
| `AuthFactorInput` | type | Input provided by the user for this factor's challenge. |
| `AuthFactorResult` | type | Result of executing an auth factor. |
| `AuthFactorExecutionContext` | type | Context passed to an AUTH_FACTOR when it executes. |
| `CanImportContext` | type |  |
| `ImportContext` | type |  |
| `CanExportContext` | type |  |
| `ExportContext` | type |  |
| `ElementLocation` | type |  |
| `ElementData` | type |  |
| `ChatMessageRole` | type | Chat message role. |
| `ChatMessage` | type | A chat message in a conversation. |
| `ToolDefinition` | type | Tool definition with JSON Schema parameters. |
| `ToolCall` | type | A tool call initiated by the LLM. |
| *(36 more)* | | |
