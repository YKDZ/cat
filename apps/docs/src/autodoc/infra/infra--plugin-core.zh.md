# 插件服务核心

> **Section**: 基础设施  ·  **Subject ID**: `infra/plugin-core`

`@cat/plugin-core` 提供插件系统的基础框架，使第三方功能可以无侵入地扩展 CAT 的服务能力与前端组件。

## 服务注册（ServiceRegistry）

`ServiceRegistry` 以服务类型（`ServiceType`）为键，维护 14 种可扩展服务点的实现映射：

| 服务类型             | 用途                    |
| -------------------- | ----------------------- |
| `llm_provider`       | 大语言模型适配器        |
| `embedding_provider` | 向量嵌入提供商          |
| `file_storage`       | 文件存储后端            |
| `email_sender`       | 邮件发送实现            |
| `oauth_provider`     | OAuth 2.0 / OIDC 提供商 |
| `vcs_adapter`        | 外部版本控制系统适配器  |
| `auth_flow`          | 自定义认证流注入        |
| `tm_scorer`          | 翻译记忆评分策略        |
| `qa_rule`            | 自定义质量检查规则      |
| ...                  | 其余类型按需扩展        |

`ServiceRegistry.register(type, impl)` 在初始化阶段注册实现，`get(type)` 在运行时按类型获取。内置默认实现保证无插件时系统仍可运行。

## 组件注册（ComponentRegistry）

`ComponentRegistry` 采用 Slot 机制，前端组件通过 Slot 名（如 `"editor.toolbar.extra"`、`"project.settings.tab"`）注入自定义 UI。

- `register(slot, component)`：将 Vue 组件绑定到指定 Slot。
- `getComponents(slot)`：获取该 Slot 下所有注册组件的有序列表，渲染时遍历插入。

## 插件发现（PluginDiscoveryService）

`PluginDiscoveryService` 是单例，在服务启动时扫描已安装的 `@cat-plugin/*` 包，加载每个包的 `plugin.ts` 入口，依次调用 `plugin.register(services, components)` 完成服务与组件的批量注册。插件 manifest（`PluginManifest`）描述插件元数据：`id`、`version`、`permissions`（所需权限）、`hooks`（监听的领域事件）。
