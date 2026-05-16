# 内容图模型

> **Section**: 领域模型  ·  **Subject ID**: `domain/content-graph`

内容图（Content Graph）是 CAT 的结构化内容组织模型，把"可翻译文本"与"内容结构上下文"解耦。元素继续作为翻译的最小单位，内容图负责描述元素和内容节点之间的包含、依赖、来源等关系，为翻译建议、术语/记忆召回、AI 上下文装配和导入导出提供结构信号。

## 核心概念

**ContentNode（内容节点）**：结构边界的抽象，可表示项目根节点、目录、文件、Markdown 章节、源码组件、UI 路由、模块、Mod、版本、命名空间、章节等任意内容边界。每个节点记录：

- `kind`：节点类型，如 `PROJECT_ROOT`、`DIRECTORY`、`FILE`、`MARKDOWN_SECTION`、`SOURCE_COMPONENT`、`MODULE`、`MOD`、`NAMESPACE` 等。
- `stableSourceNodeRef`：跨导入周期稳定的源引用，用于 upsert 节点身份。
- `exportRole`：该节点在导出时的角色（`NONE` / `DIRECTORY` / `FILE` / `SECTION`）。
- `boundaryType`：上下文边界类型（`SOURCE_ROOT` / `DIRECTORY` / `FILE` / `MODULE` / `MOD` 等）。
- `fileHandlerId` / `fileId`：关联的文件处理插件和实际文件对象（叶子文件节点）。

**ContentRelationType（关系类型注册表）**：可扩展的类型注册，每种关系类型有 `(namespace, name, version)` 三元组标识，以及 `semanticFamily`（如 `CONTAINMENT`、`DEPENDENCY`、`VERSIONING`、`EVIDENCE`、`SCOPE`）、允许的端点对、方向性、是否参与包含/导出等属性。系统内置 `core:contains:1.0.0`，插件可注册自定义类型。

**ContentRelation（内容关系边）**：连接两个端点（`NODE` 或 `ELEMENT`）的有向/无向边，记录关系类型、方向、`isPrimary`（是否为主包含边）、`localOrder`（局部排序）、`confidenceBasisPoints`（置信度 0–10000）以及来源信息。

**StableElementIdentity（元素稳定身份）**：由导入器提供的四元组 `(importerId, sourceRootRef, sourceNodeRef, stableSourceRef)`，作为跨版本更新时元素的稳定锚点，替代原来基于 `meta` 深比较的脆弱标识。

**ContextEvidence（上下文证据）**：附加到节点、元素或关系上的证据记录，`kind` 字段描述证据类型（如截图、注释、外部链接等），由上下文装配器在向模型或编辑器提供上下文时使用。

**ScopeBinding（作用域绑定）**：将结构节点与语言资产（词汇表、术语概念、翻译记忆、记忆条目、QA 规则集等）关联，控制术语/记忆召回的作用域和精度。

## 数据流

### 导入阶段（Import）

导入插件解析文件，生成 `StructuredContentPayload`：

```
payload = {
  payloadVersion: "content-graph/v1",
  projectId, sourceLanguageId, importerId, sourceRootRef,
  nodes: [StructuredContentNodeInput ...],
  elements: [StructuredTranslatableElementInput ...],
  relations: [StructuredRelationInput ...],
  evidences?: [StructuredEvidenceInput ...],
}
```

`applyStructuredContentGraphEnvelope` 命令负责将此载荷持久化到数据库中的节点和关系类型；`persistStructuredContentGraphAttachments` 处理元素和关系边。

### 差分阶段（Diff）

`diffStructuredContentOp`（`@cat/operations`）在导入时执行"稳定身份差分"：

1. 按 `(importerId, sourceRootRef, sourceNodeRef)` 拉取现有元素快照。
2. 用 `stableSourceRef` 对比新旧元素，分类为 `ADDED`、`UPDATED`、`MOVED`、`REMOVED`。
3. 写入 `SemanticDiffEntry`，供 VCS changeset 和 PR review 消费。
4. 更新向量化字符串（新增/修改的元素触发 `createVectorizedStringOp`）。

### 上下文装配（Context Assembly）

查询层通过 `getContextEvidence`、`listProjectContentNodes`、`getContentNodeElements` 等接口向消费方（编辑器、记忆召回、AI 翻译）提供有界的上下文窗口。

## 命令（Commands）

| 命令 | 说明 |
| ---- | ---- |
| `applyContentGraphEnvelope` | 持久化关系类型和内容节点（首阶段入库） |
| `persistContentGraphAttachments` | 持久化元素和关系边（二阶段入库） |
| `createRootContentNode` | 为项目创建根内容节点 |
| `createContentNodeUnderParent` | 在指定父节点下创建子内容节点（自动建立 `core:contains` 边） |
| `deleteContentNode` | 删除内容节点（级联删除子节点和关系边） |
| `ensureCoreRelationTypes` | 幂等注册所有内置关系类型 |
| `bulkUpdatePrimaryRelationOrder` | 批量更新主包含边的 `localOrder` |
| `insertSemanticDiffEntry` | 写入一条语义差分记录 |

## 查询（Queries）

| 查询 | 说明 |
| ---- | ---- |
| `getContentNode` | 按 ID 获取单个内容节点 |
| `getProjectRootContentNode` | 获取项目根节点 |
| `listProjectContentNodes` | 列出项目下所有内容节点（含父节点 ID 和局部排序） |
| `getContentNodeElements` | 分页获取节点下的可翻译元素（含翻译状态） |
| `countContentNodeElements` | 统计节点下满足过滤条件的元素数量 |
| `countContentNodeTranslations` | 统计节点下指定语言的翻译数量 |
| `getContentRelation` | 按 ID 获取关系边 |
| `getContextEvidence` | 获取上下文证据记录 |
| `listContentNodeElementIds` | 列出节点下所有元素 ID |
| `listContentNodeElementsWithChunkIds` | 列出节点下元素与向量化 chunk ID |
| `getContentNodeFirstElement` | 获取节点下第一个元素 |
| `getContentNodeElementPageIndex` | 计算某元素在分页中的位置 |
| `findProjectContentNodeByLabel` | 按显示标签查找节点 |
| `getContentNodeBlobInfo` | 获取节点关联文件的 blob 元信息 |

## 关系语义族（SemanticFamily）

| 族 | 说明 |
| -- | ---- |
| `CONTAINMENT` | 包含关系，形成树形路径 |
| `ORDERING` | 局部顺序，不参与包含但影响渲染 |
| `SOURCE_REFERENCE` | 指向源码文件或代码位置的引用 |
| `SCOPE` | 作用域绑定，关联语言资产 |
| `DEPENDENCY` | 模块/Mod 间的依赖关系 |
| `VERSIONING` | 跨版本继承或演进关系 |
| `EVIDENCE` | 截图、注释、外部链接等上下文证据 |
| `DISCUSSION` | 讨论线程 / 评论关联 |
| `DUPLICATE` | 重复内容关联 |
| `SEMANTIC` | 语义相似度关联 |
| `CUSTOM` | 插件自定义关系 |

## 兼容性

现有的平面 JSON/YAML/Markdown 文件导入路径不受影响。文件处理插件可以继续只发出元素，旧有 `sortIndex` 仍被视为有效的局部排序信号。内容图在不破坏现有平面文档流程的前提下渐进地增强结构表达能力。

## 相关主题

- [领域核心模型](./domain--core.zh.md) — Command/Query/Event 基础设施
- [版本控制集成](../infra/infra--vcs.zh.md) — Changeset 差分策略（含内容图）
- [操作与任务系统](../infra/infra--operations.zh.md) — `diffStructuredContentOp` 和 `upsertContentNodeFromFileOp`
- [共享工具库](../infra/infra--shared.zh.md) — `StructuredContentPayload`、`StableElementIdentity` 等 Schema
