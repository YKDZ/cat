# 插件服务核心

> **Section**: 基础设施  ·  **Subject ID**: `infra/plugin-core`

`@cat/plugin-core` 提供插件系统的基础框架，使第三方功能可以无侵入地扩展 CAT 的服务能力与前端组件。

## 服务注册（ServiceRegistry）

`ServiceRegistry` 以服务类型（`ServiceType`）为键，维护 14 种可扩展服务点的实现映射：

| 服务类型                 | 用途               |
| ------------------------ | ------------------ |
| `LLM_PROVIDER`           | 大语言模型适配器   |
| `TEXT_VECTORIZER`        | 文本向量化服务     |
| `VECTOR_STORAGE`         | 向量存储后端       |
| `STORAGE_PROVIDER`       | 文件存储后端       |
| `EMAIL_PROVIDER`         | 邮件发送实现       |
| `TRANSLATION_ADVISOR`    | 翻译建议提供商     |
| `QA_CHECKER`             | 自定义质量检查规则 |
| `TOKENIZER`              | 分词规则实现       |
| `NLP_WORD_SEGMENTER`     | NLP 词语切分服务   |
| `AUTH_FACTOR`            | 自定义认证因子     |
| `FILE_IMPORTER`          | 文件格式导入处理器 |
| `FILE_EXPORTER`          | 文件格式导出处理器 |
| `AGENT_TOOL_PROVIDER`    | Agent 工具集扩展   |
| `AGENT_CONTEXT_PROVIDER` | Agent 上下文扩展   |

`ServiceRegistry.register(type, impl)` 在初始化阶段注册实现，`get(type)` 在运行时按类型获取。内置默认实现保证无插件时系统仍可运行。

## 组件注册（ComponentRegistry）

`ComponentRegistry` 采用 Slot 机制，前端组件通过 Slot 名（如 `"editor.toolbar.extra"`、`"project.settings.tab"`）注入自定义 UI。

- `register(slot, component)`：将 Vue 组件绑定到指定 Slot。
- `getComponents(slot)`：获取该 Slot 下所有注册组件的有序列表，渲染时遍历插入。

## 插件发现（PluginDiscoveryService）

`PluginDiscoveryService` 是单例，在服务启动时扫描已安装的 `@cat-plugin/*` 包，加载每个包的 `plugin.ts` 入口，依次调用 `plugin.register(services, components)` 完成服务与组件的批量注册。插件 manifest（`PluginManifest`）描述插件元数据：`id`、`version`、`permissions`（所需权限）、`hooks`（监听的领域事件）。

## 插件生命周期

`@/workspaces/cat/packages/plugin-core/src/entities/plugin.ts:L57-L95` 先定义插件契约：`services`、`components`、`routes`、`onActivate`、`onDeactivate`。

`@/workspaces/cat/packages/plugin-core/src/registry/plugin-discovery.ts:L8-L63` 负责把文件系统中的 manifest / package metadata 同步进数据库 definition。

`@/workspaces/cat/packages/plugin-core/src/registry/loader.ts:L18-L122` 负责读取 `manifest.json`、`package.json`、`README.md` 并动态 import entry default export。

`@/workspaces/cat/packages/plugin-core/src/registry/plugin-manager.ts:L52-L58` 给出完整生命周期顺序：Discovery → Registration → Installation → Activation → (ConfigReload) → Deactivation → Uninstallation。

各阶段职责：

- `install()` (`L179-L201`) 只写 installation/config instance；
- `activate()` (`L245-L316`) 依次执行 ensureDefinitionSynced → mergeConfigDefaults → loadPlugin → onActivate → syncDynamicServices → registerServices → registerComponents → mountRoutes；
- `syncDynamicServices()` (`L529-L639`) 对齐 manifest 静态服务、运行时动态服务和数据库；
- `deactivate()` (`L278-L304`) 清理 service registry / component registry / route registry；
- `ServiceRegistry.combine()` (`@/workspaces/cat/packages/plugin-core/src/registry/service-registry.ts:L49-L97`) 与 `ComponentRegistry.combine()` (`@/workspaces/cat/packages/plugin-core/src/registry/component-registry.ts:L30-L60`) 把插件产物装配进运行时。
