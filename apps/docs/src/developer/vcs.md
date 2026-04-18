# VCS（版本控制系统）架构说明

CAT 内置了一套轻量级的 **版本控制系统（VCS）**，用于对项目下所有业务实体（译文、术语、文档、评论、翻译记忆、项目配置、Issue 及项目本身等）的写操作进行审计追踪和分支隔离。

本页将介绍：

- VCS 的两种运行模式及适用场景；
- 核心组件的职责与协作关系；
- 变更集（Changeset）与变更条目（ChangesetEntry）的数据模型；
- Diff 策略与应用方法的注册机制；
- 分支隔离、覆盖读取与合并的工作流程；
- 路由层与图执行引擎如何集成 VCS。

## 核心术语

| 术语                  | 含义                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Changeset**         | 一组变更条目的容器，拥有状态（`PENDING` → `APPROVED` / `PARTIALLY_APPROVED` / `REJECTED` / `CONFLICT` → `APPLIED`）。        |
| **ChangesetEntry**    | 单个实体的变更记录，包含 `before`/`after` 快照、操作类型（CREATE / UPDATE / DELETE）及风险等级。                             |
| **EntityBranch**      | 实体分支——在隔离模式下存放变更的容器，可关联 Pull Request。                                                                  |
| **DiffStrategy**      | 针对特定 `entityType` 的差异对比算法，产出 `DiffResult`。                                                                    |
| **ApplicationMethod** | 将变更条目实际写入持久层的策略。分为同步（`SimpleApplicationMethod`）和异步（`VectorizedStringApplicationMethod`）两种实现。 |
| **impactScope**       | diff 结果的影响范围：`LOCAL`（仅影响自身）或 `CASCADING`（可能触发下游更新）。                                               |
| **riskLevel**         | 基于 `impactScope` 推导的风险等级：`CASCADING` → `MEDIUM`，其余 → `LOW`。无 diff 策略的实体类型始终为 `LOW`。                |
| **SerializableType**  | 类型安全的可序列化值：允许原始类型、`Date` 及递归对象/数组，禁止函数和 `symbol`。                                            |
| **EntitySnapshot**    | 项目级 / 文档级 / 元素级的快照记录，用于在特定时间点保存实体状态。                                                           |

## VCS 运行模式

VCS 中间件通过 `VCSContext.mode` 字段区分两种模式：

### Direct（直接模式）

先执行写操作，再将 diff 结果追加到当前项目的主线 Changeset（**延迟创建**：仅在首次 `interceptWrite` 调用时创建 Changeset）。适用于人类用户在编辑器中直接操作的所有写入场景。

```
写请求 → writeFn() → 计算 diff → 追加 ChangesetEntry → 返回结果
```

`VCSContext` 需提供 `projectId` 和 `createdBy`（发起操作的用户 ID）。

### Isolation（隔离模式）

**不执行** 实际写操作，仅将变更记录到分支的 Changeset。这是 Agent 和 Pull Request 工作流的核心：所有修改在分支中暂存，经过审阅和冲突检测后才合入主线。

```
写请求 → 计算 diff → 追加到分支 ChangesetEntry → 返回模拟结果（after 值）
```

`VCSContext` 需提供 `projectId`、`branchId` 和 `branchChangesetId`。

### 模式选择：`determineWriteMode`

`packages/permissions/src/trust-isolation.ts`

权限引擎根据用户角色和项目配置决定写入模式：

1. 用户不具备 `editor` 权限 → `no_access`；
2. 用户具备 `direct_editor` 权限且项目未强制隔离（`isolation_forced`） → `direct`；
3. 其余情况 → `isolation`（必须通过分支写入）。

## 核心组件

### VCSMiddleware

`packages/vcs/src/vcs-middleware.ts`

写操作的中央拦截器。唯一的核心方法 `interceptWrite()` 接收实体变更前后的状态（`before` / `after`，类型为 `SerializableType`），根据当前模式决定行为：

1. 将 `before` / `after` 通过 `toJSONSafe()` 深度序列化为 `JSONType`（`Date` 会被转换为 ISO 字符串）；
2. 若注册了该 `entityType` 的 diff 策略，调用 `diffRegistry.diff()` 获取 `DiffResult`；若未注册（如 `project`、`issue`），则跳过 diff，`riskLevel` 默认为 `LOW`；
3. 根据 `impactScope` 确定 `riskLevel`；
4. 将条目写入对应的 Changeset。

方法签名：

```typescript
async interceptWrite<T>(
  ctx: VCSContext,
  entityType: string,
  entityId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  before: SerializableType,
  after: SerializableType,
  writeFn: () => Promise<T>,
): Promise<T>
```

`VCSContext` 完整接口：

```typescript
interface VCSContext {
  mode: "direct" | "isolation";
  projectId: string;
  sessionId?: string;
  agentRunId?: number;
  currentChangesetId?: number; // Direct 模式延迟创建
  createdBy?: string; // Direct 模式下 Changeset 创建者
  branchId?: number; // Isolation 模式
  branchChangesetId?: number; // Isolation 模式
}
```

### ChangeSetService

`packages/vcs/src/changeset-service.ts`

Changeset 和 ChangesetEntry 的完整生命周期管理：

| 能力         | 说明                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------- |
| 创建         | `createChangeSet(params)` — 创建新 Changeset                                                 |
| 追加条目     | `addEntry(changesetId, params)` — 创建 ChangesetEntry；自动判定 `asyncStatus`                |
| Diff 计算    | `diffEntities(entityType, before, after)` — 委托给 `DiffStrategyRegistry`                    |
| 审阅         | `reviewEntry(entryId, verdict)` / `reviewChangeSet(changesetId, verdict)` — 单条 / 批量审阅  |
| 应用         | `applyChangeSet(changesetId, ctx)` — 逐条调用 `ApplicationMethod`，更新 `asyncStatus`        |
| 回滚         | `rollbackChangeSet(changesetId)` — 生成逆向 Changeset（交换 before / after，反转操作类型）   |
| 异步状态聚合 | `computeAsyncStatus(changesetId)` — 返回 `ALL_READY` / `HAS_PENDING` / `HAS_FAILED` / `null` |
| OCC 检查     | `checkOCCVersion(entityType, entityId, expectedVersion)` — 乐观并发控制（当前为占位实现）    |

### DiffStrategyRegistry

`packages/vcs/src/diff-strategy-registry.ts`

将 `entityType`（字符串）映射到具体的 `DiffStrategy` 实现。提供 `register()`、`get()`、`has()`、`diff()` 四个方法。

### ApplicationMethodRegistry

`packages/vcs/src/application-method-registry.ts`

将 `entityType` 映射到 `ApplicationMethod` 实现。结构与 `DiffStrategyRegistry` 类似。

## 实体类型

系统共定义了 **15 种**实体类型（`EntityType` 枚举）：

```
translation, element, document, document_tree, comment, comment_reaction,
term, term_concept, memory_item, project_settings, project_member,
project_attributes, context, project, issue
```

其中 **13 种** 注册了 Diff 策略（`project` 和 `issue` 未注册 diff 策略——它们的变更仅作审计记录，不计算字段级差异）；**15 种** 全部注册了应用方法（`ApplicationMethod`）。

## Diff 策略

### 通用 Diff 实现

`packages/vcs/src/strategies/generic.ts`

工厂函数 `createGenericStrategy(options)` 接受以下参数：

- `entityType`：实体类型标识符
- `semanticLabel`：人可读的标签
- `impactScope`：`LOCAL` 或 `CASCADING`
- `watchedFields`（可选）：只关注哪些字段的变化

内部使用浅对比（`shallowDiff`）逐键比较 `before` 和 `after`，检测 `ADD`、`REMOVE`、`MODIFY` 三种字段变化。

### 已注册的 Diff 策略

系统在 `packages/vcs/src/diff-strategies-init.ts` 中默认注册了 **13 种**实体类型的 diff 策略：

| entityType           | impactScope | watchedFields（若限定）                   |
| -------------------- | ----------- | ----------------------------------------- |
| `translation`        | LOCAL       | content, status, stringId, languageId     |
| `element`            | CASCADING   | translatableStringId, content, name, type |
| `term`               | LOCAL       | term, status, type, language              |
| `term_concept`       | CASCADING   | definition, termIds, sourceLanguage       |
| `memory_item`        | CASCADING   | content, type, tags, slotMapping          |
| `document`           | CASCADING   | name, fileHandlerId, fileId, languageId   |
| `document_tree`      | CASCADING   | 全部字段                                  |
| `comment`            | LOCAL       | content, status, resolvedAt               |
| `comment_reaction`   | LOCAL       | type                                      |
| `project_settings`   | CASCADING   | 全部字段                                  |
| `project_member`     | LOCAL       | role, permissions                         |
| `project_attributes` | LOCAL       | 全部字段                                  |
| `context`            | LOCAL       | content, type, scope                      |

> `project` 和 `issue` 不注册 diff 策略。VCSMiddleware 对它们仍会创建 ChangesetEntry（用于审计），但 `riskLevel` 始终为 `LOW`。

`LOCAL` 表示变更仅影响当前实体；`CASCADING` 表示可能引发下游联动更新，对应的 ChangesetEntry 的 `riskLevel` 会被标记为 `MEDIUM`。

## 应用方法

Changeset 被审阅通过后，需要将条目实际写入持久层。`ApplicationMethod` 定义了执行写入的策略。

### SimpleApplicationMethod

`packages/vcs/src/methods/simple-application-method.ts`

同步应用方法——无异步依赖。所有操作立即返回 `{ status: "APPLIED" }`。

适用于以下 **11 种** 实体类型：`document`、`document_tree`、`comment`、`comment_reaction`、`term`、`project_settings`、`project_member`、`project_attributes`、`context`、`project`、`issue`。

每个 `SimpleApplicationMethod` 实例可通过 `setFetcher()` 注入 `EntityStateFetcher`，用于 rebase 时查询实体当前状态。

### VectorizedStringApplicationMethod

`packages/vcs/src/methods/vectorized-string-application-method.ts`

异步应用方法——需要向量化处理（pgvector）。`CREATE` / `UPDATE` 操作返回 `{ status: "ASYNC_PENDING", asyncTaskId: "vect-..." }`，表示后台向量化任务已提交。`DELETE` 操作可同步完成。

适用于 **4 种** 需要向量化索引的实体：`translation`、`element`、`term_concept`、`memory_item`。

`asyncDependencySpec` 定义了：

```typescript
{
  description: "TranslatableString vectorization via pgvector",
  estimatedDuration: 5000,
  retryable: true,
  maxRetries: 3,
  cancellable: false,
  completionEvent: "vectorization.completed"
}
```

### 实体状态查询注入

`packages/vcs/src/wire-entity-state-fetchers.ts`

服务器启动时调用 `wireEntityStateFetchers(appMethodRegistry, db)`，向每个 `ApplicationMethod` 注入 `EntityStateFetcher`——一个回调对象，能从实际数据库表查询实体的当前状态。这使 rebase 操作可以重写分支 entry 的 `before` 值以反映主线最新状态。

## 分支与 Pull Request 工作流

### 数据模型

**EntityBranch 表**（`packages/db/src/drizzle/schema/schema.ts`）：

| 字段               | 说明                                                   |
| ------------------ | ------------------------------------------------------ |
| `id`               | 主键（serial）                                         |
| `externalId`       | UUID，自动生成                                         |
| `projectId`        | 所属项目（级联删除）                                   |
| `name`             | 分支名称（项目内唯一，`uniqueIndex(projectId, name)`） |
| `status`           | `ACTIVE` / `MERGED` / `ABANDONED`                      |
| `hasConflicts`     | 是否存在冲突                                           |
| `baseChangesetId`  | 分支创建时主线的快照 Changeset ID（用于冲突检测）      |
| `createdBy`        | 创建者用户 ID（可选）                                  |
| `createdByAgentId` | 创建者 Agent ID（可选，与 `agentDefinition.id` 关联）  |
| `mergedAt`         | 合并时间戳                                             |

**Changeset 表**：

| 字段            | 说明                                                                                |
| --------------- | ----------------------------------------------------------------------------------- |
| `id`            | 主键（serial）                                                                      |
| `externalId`    | UUID，自动生成                                                                      |
| `projectId`     | 所属项目（级联删除）                                                                |
| `agentRunId`    | 关联的 Agent Run（可选）                                                            |
| `pullRequestId` | 关联的 Pull Request（可选）                                                         |
| `branchId`      | `null` 表示主线 Changeset；非 `null` 表示分支 Changeset                             |
| `status`        | `PENDING` / `APPROVED` / `PARTIALLY_APPROVED` / `REJECTED` / `CONFLICT` / `APPLIED` |
| `createdBy`     | 创建者用户 ID（可选）                                                               |
| `reviewedBy`    | 审阅者用户 ID（可选）                                                               |
| `summary`       | 变更摘要（文本）                                                                    |
| `asyncStatus`   | 聚合异步状态：`ALL_READY` / `HAS_PENDING` / `HAS_FAILED` / `null`                   |
| `reviewedAt`    | 审阅时间戳                                                                          |
| `appliedAt`     | 应用时间戳                                                                          |

**ChangesetEntry 表**：

| 字段           | 说明                                             |
| -------------- | ------------------------------------------------ |
| `id`           | 主键（serial）                                   |
| `changesetId`  | 所属 Changeset（级联删除）                       |
| `entityType`   | 实体类型（`EntityType` 枚举，15 种）             |
| `entityId`     | 实体 ID                                          |
| `action`       | `CREATE` / `UPDATE` / `DELETE`                   |
| `before`       | 变更前快照（JSONB）                              |
| `after`        | 变更后快照（JSONB）                              |
| `fieldPath`    | 字段路径（可选，供精细化 diff 使用）             |
| `riskLevel`    | `LOW` / `MEDIUM` / `HIGH`                        |
| `reviewStatus` | `PENDING` / `APPROVED` / `REJECTED` / `CONFLICT` |
| `asyncStatus`  | `READY` / `PENDING` / `FAILED` / `null`          |
| `asyncTaskIds` | 异步任务 ID 列表（JSONB `string[]`）             |

**EntitySnapshot 表**：

| 字段          | 说明                                         |
| ------------- | -------------------------------------------- |
| `id`          | 主键（serial）                               |
| `externalId`  | UUID，自动生成                               |
| `projectId`   | 所属项目（级联删除）                         |
| `name`        | 快照名称                                     |
| `description` | 描述（可选）                                 |
| `level`       | 快照级别：`PROJECT` / `DOCUMENT` / `ELEMENT` |
| `scopeFilter` | 范围过滤条件（JSONB）                        |
| `createdBy`   | 创建者用户 ID（可选）                        |

### 分支隔离写入

当路由请求携带分支上下文（`branchId` + `branchChangesetId`）时，VCSMiddleware 进入隔离模式：

1. 实际写操作 **不执行**；
2. `before` / `after` 被记录到分支的 ChangesetEntry；
3. 方法返回 `after` 作为模拟结果，前端行为与正常写入无异。

### 覆盖读取（Overlay Read）

`packages/vcs/src/branch-overlay.ts`

分支中的数据并没有真正写入主表，因此读取时需要将分支变更叠加到主线数据之上。

**单实体读取** — `readWithOverlay(db, branchId, entityType, entityId)`：

1. 查询分支 Changeset 中该实体的最新条目；
2. 若条目为 `DELETE`：返回 `{ data: null, action: "DELETE" }`；
3. 若条目为 `CREATE` / `UPDATE`：返回 `{ data: entry.after, action }`；
4. 若无条目：返回 `null`（调用方应回退到主线查询）。

**列表读取** — `listWithOverlay(db, branchId, entityType, mainItems, getItemId)`：

1. 查询分支 Changeset 中该类型的所有条目；
2. 遍历主线列表：
   - 条目被 `DELETE`：跳过；
   - 条目被 `UPDATE` / `CREATE`：用 `after` 数据替换；
3. 追加分支中 `CREATE` 的新条目（不在主线中的）；
4. 返回合并后的列表。

**辅助函数** — `getBranchChangesetId(db, branchId)`：获取分支关联的最新 Changeset ID，用于向该 Changeset 追加 entry。

### 冲突检测

`packages/vcs/src/branch-merge.ts` — `detectConflicts(db, branchId)`

1. 获取分支自创建以来修改的实体集合 A（分支 ChangesetEntry）；
2. 获取主线自 `baseChangesetId` 以来修改的实体集合 B（主线 ChangesetEntry）；
3. 取交集 A ∩ B：若同一实体（`entityType:entityId`）在分支和主线都被修改，则报告冲突。

冲突信息包含：`entityType`、`entityId`、双方的 `action` 和 `after` 值。

冲突检测为实体级别——不做字段级三方合并。

### 合并流程

`packages/vcs/src/branch-merge.ts` — `mergeBranch(db, branchId, mergedByUserId)`

```
               ┌──────────────────┐
               │ 检测冲突          │
               └────────┬─────────┘
                        │
            ┌───────────┴───────────┐
            │ 有冲突                │ 无冲突
            ▼                       ▼
  标记 hasConflicts=true      创建主线 Changeset (status=APPLIED)
  返回冲突列表                复制分支条目到主线
                              标记分支 status=MERGED, 记录 mergedAt
                              返回 mainChangesetId
```

空分支（无 entry）直接标记为 `MERGED`，不创建主线 Changeset。

### 变基（Rebase）

`packages/vcs/src/branch-merge.ts` — `rebaseBranch(db, branchId, appMethodRegistry)`

变基操作分两步：

1. 将分支的 `baseChangesetId` 更新为主线最新的 Changeset ID，使分支"跟上"主线的进度；
2. **重写 before 值**：对分支中所有 `UPDATE` / `DELETE` entry，通过 `ApplicationMethod.fetchCurrentStates()` 查询实体在主线中的最新状态，批量更新 entry 的 `before` 字段（`batchUpdateEntryBefore`）。

变基后重新检测冲突可能消除之前的冲突。

### 完整 PR 合并操作

`packages/operations/src/merge-pr-full.ts` — `mergePRFull(ctx, { prExternalId, mergedBy })`

在单个数据库事务中执行完整的 PR 合并流程：

1. 获取 PR 及关联分支，验证分支状态为 `ACTIVE`；
2. 调用 `mergeBranch()` 执行冲突检测和 entry 复制；
3. 若有冲突，抛出 `MergePRConflictError`，事务回滚；
4. 若无冲突且产生了 `mainChangesetId`，调用 `csService.applyChangeSet()` 逐条应用变更；
5. 调用 `mergePR` 域命令更新 PR 和分支状态。

### 完整 PR 变基操作

`packages/operations/src/rebase-pr-full.ts` — `rebasePRFull(ctx, { prExternalId })`

在数据库事务中执行：

1. 获取 PR 及关联分支，验证分支状态为 `ACTIVE`；
2. 调用 `rebaseBranch()` 移动基线并重写 before 值；
3. 调用 `detectConflicts()` 重新检测冲突；
4. 更新分支的 `hasConflicts` 标记。

## 路由层集成

### VCS Route Helper

`apps/app-api/src/utils/vcs-route-helper.ts`

```typescript
export const createVCSRouteHelper = (db: DbHandle) => {
  const { diffRegistry, appMethodRegistry } = getDefaultRegistries();
  const csService = new ChangeSetService(db, diffRegistry, appMethodRegistry);
  const middleware = new VCSMiddleware(csService, diffRegistry);
  return { csService, middleware, diffRegistry, appMethodRegistry };
};
```

全局注册表通过 `getDefaultRegistries()` 缓存（单例模式），每次路由调用复用同一份 diff 策略和应用方法实例，仅 `ChangeSetService` 和 `VCSMiddleware` 按请求创建。

### `withBranchContext` 中间件

`apps/app-api/src/orpc/middleware/with-branch-context.ts`

路由级中间件，处理分支上下文注入和写入模式强制：

1. 当请求携带 `branchId` 时：
   - 验证分支存在且状态为 `ACTIVE`；
   - 检查用户对分支所属项目的 `editor` 权限；
   - 查询 `branchChangesetId`，注入 `branchId` / `branchChangesetId` / `branchProjectId` 到上下文；
2. 当无 `branchId` 但提供了 `projectId` 时：
   - 调用 `determineWriteMode()` 检查项目是否强制隔离模式；
   - 若为 `isolation_forced`，抛出 `FORBIDDEN`（必须提供 `branchId`）。

### 路由使用模式

路由处理器通过 `withBranchContext` 获取分支上下文，然后按优先级依次检查：隔离模式（分支存在）→ Direct 模式（提供了 `projectId`）→ 常规写入（无 VCS 上下文）。

```typescript
// 1. 检查分支上下文 → 隔离模式
if (context.branchId !== undefined && context.branchChangesetId !== undefined) {
  const { middleware } = createVCSRouteHelper(drizzle);
  await middleware.interceptWrite(
    {
      mode: "isolation",
      projectId: context.branchProjectId,
      branchId: context.branchId,
      branchChangesetId: context.branchChangesetId,
    },
    "document",
    entityId,
    "CREATE",
    null,                                    // before
    { projectId, name, languageId },         // after
    async () => undefined,                   // writeFn 不会被执行
  );
  return;
}

// 2. 提供了 projectId → Direct 模式（懒加载 Changeset）
if (input.projectId !== undefined) {
  const { middleware } = createVCSRouteHelper(drizzle);
  return await middleware.interceptWrite(
    {
      mode: "direct",
      projectId: input.projectId,
      createdBy: user.id,
    },
    "document",
    entityId,
    "CREATE",
    null,
    { ...input },
    async () => executeCommand({ db: drizzle }, createDocument, { ... }),
  );
}

// 3. 无 VCS 上下文——常规写入
await executeCommand({ db: drizzle }, createDocument, { ... });
```

### 已集成 VCS 的路由

| 路由文件         | 实体类型              | 操作                   | Direct         | Isolation | Overlay 读取                                               |
| ---------------- | --------------------- | ---------------------- | -------------- | --------- | ---------------------------------------------------------- |
| `document.ts`    | `document`, `element` | CREATE                 | ✓（via graph） | ✓         | `readWithOverlay`（get）、`listWithOverlay`（getElements） |
| `translation.ts` | `translation`         | CREATE                 | ✓（via graph） | ✓         | `listWithOverlay`（getAll）                                |
| `glossary.ts`    | `term`                | CREATE, DELETE         | ✓              | ✓         | `listWithOverlay`（getConceptSubjects）                    |
| `comment.ts`     | `comment`             | CREATE                 | ✓              | ✓         | `listWithOverlay`（getRootComments）                       |
| `memory.ts`      | `memory_item`         | CREATE                 | ✓              | ✓         | —                                                          |
| `project.ts`     | `project`             | CREATE, UPDATE, DELETE | ✓              | —         | —                                                          |
| `issue.ts`       | `issue`               | CREATE                 | ✓              | —         | —                                                          |

> `project.ts` 和 `issue.ts` 仅使用 Direct 模式——项目和 Issue 的创建 / 修改 / 删除不通过分支工作流，但仍被审计记录。

### Graph Runtime VCS 集成

图执行引擎（`@cat/workflow`）支持 VCS 上下文传播。在调用 `runGraph()` 或 `startGraph()` 时，通过 `SchedulerStartOptions` 传入 `vcsContext` 和 `vcsMiddleware`，调度器会将它们注入到 `GraphRuntimeContext`，进而传递到每个图节点的 `TypedNodeContext` 中。

```typescript
await runGraph(
  upsertDocumentGraph,
  { documentId, fileId, ... },
  {
    pluginManager,
    vcsContext: { mode: "direct", projectId, createdBy: user.id },
    vcsMiddleware: createVCSRouteHelper(drizzle).middleware,
  },
);
```

图节点内使用 `executeWithVCS()` 辅助函数（`packages/workflow/src/graph/vcs-write-helper.ts`）包裹写操作：

```typescript
import { executeWithVCS } from "@cat/workflow";

// 在图节点处理器中
const result = await executeWithVCS(
  ctx, // TypedNodeContext（含 vcsContext / vcsMiddleware）
  "translation", // entityType
  entityId, // entityId
  "CREATE", // action
  null, // before
  afterSnapshot, // after
  async () => actualWriteOp(),
);
```

当节点上下文中没有 `vcsContext` 或 `vcsMiddleware` 时（测试 / 旧路径），`executeWithVCS` 直接调用写函数，保持向后兼容。

## 服务器启动初始化

`apps/app/src/app/pages/+onCreateGlobalContext.server.ts`

服务器启动时执行一次性的 VCS 初始化：

```typescript
const { appMethodRegistry } = getDefaultRegistries();
wireEntityStateFetchers(appMethodRegistry, drizzleDB.client);
```

`getDefaultRegistries()` 创建并缓存全局注册表（diff 策略 + 应用方法）；`wireEntityStateFetchers()` 向每个应用方法注入数据库查询回调，使 rebase 操作能够读取实体当前状态。

## 端到端流程示例

以 **Agent 在隔离模式下创建一条译文** 为例：

```
Agent 请求 → translation 路由
  │
  ├─ withBranchContext 中间件注入 branchId=42, branchChangesetId=555
  │
  ├─ createVCSRouteHelper(db) → 获取 middleware
  │
  ├─ middleware.interceptWrite(ctx, "translation", "tr-123", "CREATE", null, {content, status, ...}, writeFn)
  │   │
  │   ├─ toJSONSafe(before) → null
  │   ├─ toJSONSafe(after)  → { content: "...", status: "...", ... }  (Date → ISO string)
  │   │
  │   ├─ diffRegistry.diff("translation", null, {...})
  │   │   └─ DiffResult { impactScope: "LOCAL" } → riskLevel: "LOW"
  │   │
  │   ├─ changeSetService.addEntry(555, { entityType: "translation", entityId: "tr-123", ... })
  │   │   └─ 创建 ChangesetEntry (asyncStatus: "PENDING" — 需向量化)
  │   │
  │   └─ 不执行 writeFn() → 返回 after 作为模拟结果
  │
  └─ 路由返回成功响应
```

后续的 PR 合并流程（`mergePRFull`）：

```
PR 审阅通过 → mergePRFull(ctx, { prExternalId, mergedBy })
  │
  ├─ 获取 PR → 获取 branch (branchId=42)
  │
  ├─ db.transaction 开始
  │   │
  │   ├─ mergeBranch(tx, 42, userId)
  │   │   ├─ detectConflicts() → 无冲突
  │   │   ├─ 创建主线 Changeset (branchId=null, status=APPLIED)
  │   │   ├─ 复制分支条目到主线 Changeset
  │   │   └─ 标记分支 status=MERGED, mergedAt=now
  │   │
  │   ├─ csService.applyChangeSet(mainChangesetId)
  │   │   ├─ VectorizedStringApplicationMethod.applyCreate()
  │   │   │   └─ 返回 { status: "ASYNC_PENDING", asyncTaskId: "vect-..." }
  │   │   └─ 更新 entry asyncStatus
  │   │
  │   └─ mergePR 域命令 → 更新 PR 状态
  │
  └─ 事务提交 → 后台向量化完成 → asyncStatus 更新为 "READY"
```

## 设计要点

1. **全实体覆盖**：VCS 不仅追踪翻译资产，而是覆盖与项目有从属关系的所有业务实体——译文、术语、文档、评论、翻译记忆、项目配置、成员权限、Issue 以及项目自身。15 种实体类型全部注册应用方法，13 种注册 diff 策略。

2. **写入序列化**：所有 `before` / `after` 值在进入 diff 和存储逻辑前，都经过 `toJSONSafe()` 深度序列化。这统一了 `Date`（转为 ISO 字符串）等类型的处理，同时利用 `SerializableType` 在编译期拒绝不可序列化的值（如函数、`symbol`）。

3. **异步感知**：Changeset 和 ChangesetEntry 均追踪 `asyncStatus`，支持向量化等耗时操作在后台完成而不阻塞请求响应。ChangesetEntry 级别使用 `READY` / `PENDING` / `FAILED`；Changeset 级别聚合为 `ALL_READY` / `HAS_PENDING` / `HAS_FAILED`。

4. **实体级冲突检测**：采用简单的实体级交集检测（`entityType:entityId`），避免复杂的三方合并。对于翻译场景，这种策略足够有效——同一实体不太可能被两个上下文同时修改。

5. **风险驱动审阅**：`riskLevel` 由 diff 的 `impactScope` 自动推导，使审阅者能优先关注影响范围更大的变更。无 diff 策略的实体（`project`、`issue`）默认 `LOW`。

6. **注册表缓存**：Diff 策略和应用方法的注册表在模块级别缓存为单例（`_cachedRegistries`），所有路由共享同一实例。

7. **延迟应用**：变更条目在 Changeset 被审阅通过并明确调用 `applyChangeSet()` 后才真正写入。这允许 Changeset 在应用前被审阅、拒绝或回滚。

8. **事务安全**：`mergePRFull` 在单个数据库事务中执行冲突检测、entry 复制、变更应用和状态更新，任一步骤失败则全量回滚。

9. **Rebase before 重写**：变基操作不仅移动基线 ID，还通过 `EntityStateFetcher` 查询实体最新状态，批量更新分支 entry 的 `before` 字段，确保后续 diff 和冲突检测基于最新数据。
