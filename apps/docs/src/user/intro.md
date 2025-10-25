# CAT 平台用户指南

CAT（Computer-Assisted Translation）是一套面向团队的自托管翻译协作平台。它结合 Web 前端、tRPC API 与 BullMQ 任务队列，为项目提供文件导入、翻译记忆、术语库、自动翻译以及可插拔扩展能力。本指南概述核心特性、基础流程与当前限制，帮助首次接触的用户快速理解系统。

## 核心亮点

- **端到端自托管**：前端（`apps/app`）、API（`apps/app-api`）、后台任务（`apps/app-workers`）与插件体系均在本地运行，可按需部署。
- **插件化设计**：所有认证方式、存储、文件解析、翻译建议、向量化引擎均通过插件管理，易于扩展或替换。
- **实时辅助手段**：翻译编辑器实时推送翻译建议（Translation Advisor）、翻译记忆匹配、术语提示，并自动校验占位符、数字等关键元素。
- **翻译资产管理**：项目可绑定术语库、翻译记忆库；译文可投票与审批，并支持批量自动批准/翻译。
- **异步任务保障**：文件解析、自动翻译、译文更新与导出通过 BullMQ 队列后台执行，避免占用前端资源。

## 整体架构

| 层级       | 位置                   | 说明                                                                         |
| ---------- | ---------------------- | ---------------------------------------------------------------------------- |
| Web 客户端 | `apps/app`             | 基于 Vike + Vue 3 + Pinia 的单页应用，提供项目、文件、编辑器与后台管理界面。 |
| API 层     | `apps/app-api`         | tRPC 路由（`src/trpc`）封装业务逻辑，统一校验与权限控制。                    |
| 任务执行   | `apps/app-workers`     | BullMQ Worker 执行文件解析、自动翻译、导出等耗时任务。                       |
| 插件核心   | `packages/plugin-core` | 负责加载、配置与实例化插件服务。                                             |
| 共享模型   | `packages/shared`      | 以 Zod 描述的实体、枚举与工具函数，前后端共用。                              |
| 基础设施   | `packages/db`          | 管理 Drizzle ORM、Redis 连接与系统设置同步。                                 |

## 快速上手流程

1. **准备系统设置**
   - 安装并启用所需插件（默认包含 S3 存储、LibreTranslate 建议器、Ollama 向量化、JSON/YAML/Markdown 文件处理、Email+密码/OIDC 认证等）。
   - 使用管理端的插件配置表单（JSON Schema 自动渲染，支持即时保存）设置连接信息，如 S3 端点、LibreTranslate API Key 等。
2. **登录与身份验证**
   - 登陆页会根据已安装的认证插件动态展示表单；支持邮箱密码登录，也可接入 OIDC 单点登录。
3. **创建项目**
   - 指定项目名称、描述、目标语言。
   - 可选择已有翻译记忆或术语库，或勾选「自动创建」生成专属资产。
4. **上传源文件**
   - 支持 `.json`、`.yml/.yaml`、`.md`（可通过插件扩展更多格式）。
   - 上传流程：前端获取预签名 URL → 直传至 S3 → 请求 `document.createFromFile` → 后台队列 `upsertDocumentElementsFromFile` 解析可翻译段落。
   - 任务完成后文档会出现在项目文档列表中。
5. **进入翻译工作台**
   - 布局包含：原文区、译文输入、翻译操作栏、译文版本列表、自动建议、翻译记忆、术语面板。
   - 快捷键：`Ctrl+Enter` 提交并跳到下一条、`Ctrl+Shift+Enter` 仅提交、`Ctrl+Z`/`Ctrl+Shift+Z` 撤销重做。
   - 工具栏会即时校验占位符、数字、换行等元素数量与内容是否匹配，并给出警告列表。
   - 建议面板实时订阅 `suggestion.onNew`，展示来自 LibreTranslate 等建议器的结果；记忆面板订阅 `memory.onNew`，可调整最低匹配度；术语面板调用 `glossary.findTerm` 高亮术语。
6. **协作与质量控制**
   - 每条译文支持版本记录与投票；审批后才视为最终译文。
   - 「自动翻译」会以记忆优先，未命中时调用选定的建议器批量创建译文（状态为 `PROCESSING`，由 Worker 写入数据库后转为完成）。
   - 「自动批准」会挑选投票最高的译文并批量激活审批记录。
7. **导出交付**
   - 文档语言行的「下载」按钮会触发 `document.exportTranslatedFile` 任务，待队列处理完成，可在「任务」页面下载生成文件。
   - 导出内容通过插件文件处理器将译文写回原始结构，存储于 S3 并提供一次性下载链接。

## 翻译资产管理

- **翻译记忆**：存储源文、译文与向量（由 Ollama Vectorizer 生成）。项目创建时可挂载多个记忆库，编辑器实时推送相似度匹配。
- **术语库**：通过 Elasticsearch 术语服务解析、索引术语；可批量导入术语对，支持双向关联与全文检索。
- **任务与状态**：`createTranslation` / `updateTranslation` Worker 负责写入译文并同步翻译记忆项；`autoTranslate` 支持批量补全。

## 插件与扩展

| 类别                                  | 内置插件                    | 职责                                         |
| ------------------------------------- | --------------------------- | -------------------------------------------- |
| 认证（AUTH_PROVIDER）                 | Email+Password, OIDC        | 登录方式；Auth 表单由插件返回 JSON Schema。  |
| 存储（STORAGE_PROVIDER）              | S3 Storage Provider         | 生成上传/下载签名 URL，管理文件生命周期。    |
| 文件处理（TRANSLATABLE_FILE_HANDLER） | JSON、YAML、Markdown 处理器 | 把文件拆分为可翻译元素，导出时重建结构。     |
| 翻译建议（TRANSLATION_ADVISOR）       | LibreTranslate Advisor      | 调用外部 MT API 获取译文建议，可返回多候选。 |
| 文本向量化（TEXT_VECTORIZER）         | Ollama Vectorizer           | 为源文与译文生成 Embedding，供记忆匹配使用。 |
| 术语服务（TERM_SERVICE）              | Elasticsearch Term Service  | 负责术语索引、匹配、术语化文本处理。         |

可以在「管理后台 → 插件」查看插件列表、安装状态、同步配置，并通过「刷新插件」重新加载。

## 任务与通知

- 队列名称涵盖 `upsertDocumentElementsFromFile`、`batchDiffElements`、`createTranslation`、`updateTranslation`、`autoTranslate`、`exportTranslatedFile` 等，均由 `apps/app-workers` 实例执行。
- 任务状态可在项目的「任务」页面查看，完成后可下载附件或确认结果。任务失败会在前端以 Toast 形式提示。

## 管理功能速览

- **系统设置**：JSON Schema 动态表单，自动按字段类型节流写入数据库。
- **插件配置**：与设置表单复用逻辑，支持分 Scope（GLOBAL/PROJECT/USER）保存。
- **语言资源**：语言列表由 `language.getAll` 提供，可用于文件上传、项目目标语言选择。

## 当前限制与已知工作中内容

- 团队成员与角色管理页面（`project/@projectId/members`）尚未实现，仅预留路由。
- 文档翻译进度组件仍在填充数据逻辑，目前显示为 0%。
- 任务通知仅通过页面轮询/跳转触发，不包含站内消息或邮件提醒。
- 仅支持 JSON/YAML/Markdown 文件，Office 文档等格式需额外开发插件。

## 常用快捷键

| 操作                     | 快捷键                          |
| ------------------------ | ------------------------------- |
| 提交当前译文并前往下一条 | `Ctrl + Enter`                  |
| 仅提交当前译文           | `Ctrl + Shift + Enter`          |
| 撤销 / 重做              | `Ctrl + Z` / `Ctrl + Shift + Z` |
| 清空输入                 | 工具栏垃圾桶按钮                |
| 将原文复制到译文         | 工具栏复制按钮                  |

## 核心数据模型

- **Project**：包含名称、描述、目标语言、创建者。
- **Document**：关联文件处理器与项目；解析后包含多个 Translatable Element。
- **Translatable Element**：存储排序索引、元信息（如 JSON/YAML 路径、Markdown 节点路径）。
- **Translation**：译文内容，包含创建者、语言、向量 ID，可被投票、审批。
- **Memory / Glossary**：翻译资产，分别存储句段对与术语对，并支持项目关联表。

## 推荐后续阅读

- 管理员可继续查看 `apps/docs/src/developer/future.md` 中的扩展构想，了解系统演进方向。
- 想了解插件实现细节，可阅读 `packages/plugin-core` 与 `packages/@cat-plugin/*` 示例代码。
