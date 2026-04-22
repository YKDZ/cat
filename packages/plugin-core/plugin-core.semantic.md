---
subject: infra/plugin-core
---

`@cat/plugin-core` 提供插件系统的基础框架，使第三方功能可以无侵入地扩展 CAT 的服务能力与前端组件。

## 服务注册（ServiceRegistry）

`ServiceRegistry` 以服务类型（`ServiceType`）为键，维护 14 种可扩展服务点的实现映射：

| 服务类型                   | 用途                        |
| -------------------------- | --------------------------- |
| `LLM_PROVIDER`             | 大语言模型适配器            |
| `TEXT_VECTORIZER`          | 文本向量化服务              |
| `VECTOR_STORAGE`           | 向量存储后端                |
| `STORAGE_PROVIDER`         | 文件存储后端                |
| `EMAIL_PROVIDER`           | 邮件发送实现                |
| `TRANSLATION_ADVISOR`      | 翻译建议提供商              |
| `QA_CHECKER`               | 自定义质量检查规则          |
| `TOKENIZER`                | 分词规则实现                |
| `NLP_WORD_SEGMENTER`       | NLP 词语切分服务            |
| `AUTH_FACTOR`              | 自定义认证因子              |
| `FILE_IMPORTER`            | 文件格式导入处理器          |
| `FILE_EXPORTER`            | 文件格式导出处理器          |
| `AGENT_TOOL_PROVIDER`      | Agent 工具集扩展            |
| `AGENT_CONTEXT_PROVIDER`   | Agent 上下文扩展            |

`ServiceRegistry.register(type, impl)` 在初始化阶段注册实现，`get(type)` 在运行时按类型获取。内置默认实现保证无插件时系统仍可运行。

## 组件注册（ComponentRegistry）

`ComponentRegistry` 采用 Slot 机制，前端组件通过 Slot 名（如 `"editor.toolbar.extra"`、`"project.settings.tab"`）注入自定义 UI。

- `register(slot, component)`：将 Vue 组件绑定到指定 Slot。
- `getComponents(slot)`：获取该 Slot 下所有注册组件的有序列表，渲染时遍历插入。

## 插件发现（PluginDiscoveryService）

`PluginDiscoveryService` 是单例，在服务启动时扫描已安装的 `@cat-plugin/*` 包，加载每个包的 `plugin.ts` 入口，依次调用 `plugin.register(services, components)` 完成服务与组件的批量注册。插件 manifest（`PluginManifest`）描述插件元数据：`id`、`version`、`permissions`（所需权限）、`hooks`（监听的领域事件）。
