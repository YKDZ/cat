---
subject: infra/vcs
---

`@cat/vcs` 实现了 CAT 内置的版本控制系统，以 **Changeset**（变更集）为核心数据结构，支持隔离模式的草稿翻译分支，并提供分支合并、冲突检测与变基等完整操作。

## 核心模型

**Changeset** 是单次提交的原子变更单元，包含：

- `branchId`：所属分支。
- `parentId`：父变更集 ID，形成链表式历史。
- `entries`：`ChangesetEntry[]`，每条条目记录 `entityType`（如 `translation`、`element`）、`entityId`、`operation`（`create` / `update` / `delete`）和 `payload`（序列化的实体快照）。

**Branch** 分为两种工作模式：

| 模式        | 说明                                                       |
| ----------- | ---------------------------------------------------------- |
| `Direct`    | 变更直接提交到主线数据库，适合已审核的正式翻译             |
| `Isolation` | 变更存储在 Changeset 中，不影响主线，适合草稿或自动翻译 PR |

## 读取叠加（Overlay Read）

`readWithOverlay(entityType, entityId, branchId)` 和 `listWithOverlay(entityType, filter, branchId)` 是隔离模式下的读取入口。实现逻辑：

1. 从主线数据库读取最新快照。
2. 查找该分支从分叉点到最新提交的所有 Changeset，按时序重放 `ChangesetEntry`，将草稿变更叠加在主线快照之上。
3. 返回叠加后的最终状态，使前端可将草稿译文渲染为编辑器 ghost text。

## 冲突与合并

**`detectConflicts(sourceBranch, targetBranch)`**：比对两条分支自共同祖先以来的 Changeset，找出对同一实体（同 `entityType` + `entityId`）均有变更的条目，返回冲突列表。

**`mergeBranch(source, target, strategy)`**：将 source 的 Changeset 应用到 target 主线；`strategy` 支持 `ours`（保留目标）、`theirs`（覆盖为源）或逐条解决（`manual` 需提前解决冲突）。

**`rebaseBranch(branch, newBase)`**：将分支历史移至新基点，按顺序重放 Changeset，自动跳过与新基点相同的无冲突变更。

## 差异策略（DiffStrategy）

不同实体类型使用不同的差异计算逻辑：`TranslationDiffStrategy` 按字段级别对比译文，`ElementDiffStrategy` 对比源文本与元数据变化。`ApplicationMethodRegistry` 管理各实体类型对应的 Changeset 应用方式（如 `upsert`、`patch`、`delete`），确保重放时语义正确。
