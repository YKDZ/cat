# VCS（版本控制系统）架构说明

CAT 内置了一套轻量级的 **版本控制系统（VCS）**，用于对翻译资产（译文、术语、文档结构等）的写操作进行审计追踪和分支隔离。

本页将介绍：

- VCS 的三种运行模式及适用场景；
- 核心组件的职责与协作关系；
- 变更集（Changeset）与变更条目（ChangesetEntry）的数据模型；
- Diff 策略与应用方法的注册机制；
- 分支隔离、覆盖读取与合并的工作流程；
- 路由层如何集成 VCS。

## 核心术语

| 术语                  | 含义                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Changeset**         | 一组变更条目的容器，拥有状态（`PENDING` → `APPROVED` / `REJECTED` → `APPLIED`）。                 |
| **ChangesetEntry**    | 单个实体的变更记录，包含 `before`/`after` 快照、操作类型（CREATE / UPDATE / DELETE）及风险等级。  |
| **EntityBranch**      | 实体分支——在隔离模式下存放变更的容器，可关联 Pull Request。                                       |
| **DiffStrategy**      | 针对特定 `entityType` 的差异对比算法，产出 `DiffResult`。                                         |
| **ApplicationMethod** | 将变更条目实际写入持久层的策略。分为同步（`SimpleApplicationMethod`）和异步（如向量化）两种实现。 |
| **impactScope**       | diff 结果的影响范围：`LOCAL`（仅影响自身）或 `CASCADING`（可能触发下游更新）。                    |
| **riskLevel**         | 基于 `impactScope` 推导的风险等级：`CASCADING` → `MEDIUM`，其余 → `LOW`。                         |
| **SerializableType**  | 类型安全的可序列化值：允许原始类型、`Date` 及递归对象/数组，禁止函数和 `symbol`。                 |

## VCS 运行模式

VCS 中间件通过 `VCSContext.mode` 字段区分三种模式：

### Trust（信任模式）

直接执行写操作，不产生任何审计记录。适用于初始导入、批量迁移等无需审计的场景。

```
写请求 → writeFn() → 返回结果
```

### Audit（审计模式）

先执行写操作，再将 diff 结果追加到当前活跃的 Changeset。适用于人类用户在编辑器中直接操作的场景。

```
写请求 → writeFn() → 计算 diff → 追加 ChangesetEntry → 返回结果
```

需要在 `VCSContext` 中设置 `currentChangesetId`。

### Isolation（隔离模式）

**不执行** 实际写操作，仅将变更记录到分支的 Changeset。这是 Agent 和 Pull Request 工作流的核心：所有修改在分支中暂存，经过审阅和冲突检测后才合入主线。

```
写请求 → 计算 diff → 追加到分支 ChangesetEntry → 返回模拟结果（after 值）
```

需要在 `VCSContext` 中设置 `branchId` 和 `branchChangesetId`。

## 核心组件

### VCSMiddleware

`packages/vcs/src/vcs-middleware.ts`

写操作的中央拦截器。唯一的核心方法 `interceptWrite()` 接收实体变更前后的状态（`before` / `after`，类型为 `SerializableType`），根据当前模式决定行为：

1. 将 `before` / `after` 通过 `toJSONSafe()` 深度序列化为 `JSONType`（`Date` 会被转换为 ISO 字符串）；
2. 若注册了该 `entityType` 的 diff 策略，调用 `diffRegistry.diff()` 获取 `DiffResult`；
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

### DiffStrategyRegistry

`packages/vcs/src/diff-strategy-registry.ts`

将 `entityType`（字符串）映射到具体的 `DiffStrategy` 实现。提供 `register()`、`get()`、`has()`、`diff()` 四个方法。

### ApplicationMethodRegistry

`packages/vcs/src/application-method-registry.ts`

将 `entityType` 映射到 `ApplicationMethod` 实现。结构与 `DiffStrategyRegistry` 类似。

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

`LOCAL` 表示变更仅影响当前实体；`CASCADING` 表示可能引发下游联动更新，对应的 ChangesetEntry 的 `riskLevel` 会被标记为 `MEDIUM`。

## 应用方法

Changeset 被审阅通过后，需要将条目实际写入持久层。`ApplicationMethod` 定义了执行写入的策略。

### SimpleApplicationMethod

`packages/vcs/src/methods/simple-application-method.ts`

同步应用方法——无异步依赖。所有操作立即返回 `{ status: "APPLIED" }`。适用于大多数实体类型（document、comment、term 等）。

### VectorizedStringApplicationMethod

`packages/vcs/src/methods/vectorized-string-application-method.ts`

异步应用方法——需要向量化处理（pgvector）。`CREATE` / `UPDATE` 操作返回 `{ status: "ASYNC_PENDING", asyncTaskId: "vect-..." }`，表示后台向量化任务已提交。`DELETE` 操作可同步完成。

适用于 translation、element、term_concept、memory_item 等需要向量化索引的实体。

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

## 分支与 Pull Request 工作流

### 数据模型

**EntityBranch 表**：

| 字段              | 说明                                              |
| ----------------- | ------------------------------------------------- |
| `id`              | 主键                                              |
| `projectId`       | 所属项目                                          |
| `name`            | 分支名称（项目内唯一）                            |
| `status`          | `ACTIVE` / `MERGED` / `CONFLICTED`                |
| `hasConflicts`    | 是否存在冲突                                      |
| `baseChangesetId` | 分支创建时主线的快照 Changeset ID（用于冲突检测） |
| `createdBy`       | 创建者（用户或 Agent）                            |

**Changeset 表**：

| 字段            | 说明                                                    |
| --------------- | ------------------------------------------------------- |
| `branchId`      | `null` 表示主线 Changeset；非 `null` 表示分支 Changeset |
| `status`        | `PENDING` → `APPROVED` / `REJECTED` → `APPLIED`         |
| `asyncStatus`   | 聚合异步状态：`PENDING` / `READY` / `FAILED` / `null`   |
| `pullRequestId` | 关联的 PR（可选）                                       |

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
   - 条目被 `UPDATE`：用 `after` 数据替换；
3. 追加分支中 `CREATE` 的新条目；
4. 返回合并后的列表。

### 冲突检测

`packages/vcs/src/branch-merge.ts` — `detectConflicts(db, branchId)`

1. 获取分支自创建以来修改的实体集合 A（分支 ChangesetEntry）；
2. 获取主线自 `baseChangesetId` 以来修改的实体集合 B（主线 ChangesetEntry）；
3. 取交集 A ∩ B：若同一实体在分支和主线都被修改，则报告冲突。

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
  标记 hasConflicts=true      创建主线 Changeset
  返回冲突列表                复制分支条目到主线
                              标记分支 status=MERGED
                              返回 mainChangesetId
```

### 变基（Rebase）

`packages/vcs/src/branch-merge.ts` — `rebaseBranch(db, branchId)`

将分支的 `baseChangesetId` 更新为主线最新的 Changeset ID，使分支"跟上"主线的进度。变基后重新检测冲突可能消除之前的冲突。

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

全局注册表通过 `getDefaultRegistries()` 缓存（单例模式），避免每次路由调用都重新创建 13 种 diff 策略和应用方法。

### 路由使用模式

路由处理器通过中间件 `with-branch-context` 获取分支上下文，然后根据是否存在 `branchId` 决定走隔离模式还是常规写入。典型模式如下：

```typescript
// 1. 检查分支上下文
if (context.branchId !== undefined && context.branchChangesetId !== undefined) {
  // 2. 确保 branchProjectId 存在
  if (context.branchProjectId === undefined) {
    throw new Error("branchProjectId missing when branch context is active");
  }
  // 3. 走隔离模式
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

// 4. 无分支上下文——常规写入（Trust 或 Audit 模式）
await executeCommand({ db: drizzle }, createDocument, { ... });
```

当前使用了 VCS 隔离模式的路由包括：

- `apps/app-api/src/orpc/routers/document.ts` — 文档创建 / 删除
- `apps/app-api/src/orpc/routers/translation.ts` — 译文更新
- `apps/app-api/src/orpc/routers/glossary.ts` — 术语创建 / 更新
- `apps/app-api/src/orpc/routers/comment.ts` — 评论创建
- `apps/app-api/src/orpc/routers/memory.ts` — 翻译记忆创建

## 端到端数据流示例

以 **Agent 在隔离模式下创建一条译文** 为例：

```
Agent 请求 → translation 路由
  │
  ├─ with-branch-context 中间件注入 branchId=42, branchChangesetId=555
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

后续的合并流程：

```
PR 审阅通过 → mergeBranch(db, branchId=42, userId)
  │
  ├─ detectConflicts() → 无冲突
  │
  ├─ 创建主线 Changeset (branchId=null)
  ├─ 复制分支条目到主线 Changeset
  ├─ 更新分支 status="MERGED"
  │
  └─ applyChangeSet(mainChangesetId)
      │
      ├─ VectorizedStringApplicationMethod.applyCreate()
      │   └─ 返回 { status: "ASYNC_PENDING", asyncTaskId: "vect-..." }
      │
      └─ 后台向量化完成 → asyncStatus 更新为 "READY"
```

## 设计要点

1. **写入序列化**：所有 `before` / `after` 值在进入 diff 和存储逻辑前，都经过 `toJSONSafe()` 深度序列化。这统一了 `Date`（转为 ISO 字符串）等类型的处理，同时利用 `SerializableType` 在编译期拒绝不可序列化的值（如函数、`symbol`）。

2. **异步感知**：Changeset 和 ChangesetEntry 均追踪 `asyncStatus`，支持向量化等耗时操作在后台完成而不阻塞请求响应。

3. **实体级冲突检测**：采用简单的实体级交集检测，避免复杂的三方合并。对于翻译场景，这种策略足够有效——同一译文不太可能被两个上下文同时修改。

4. **风险驱动审阅**：`riskLevel` 由 diff 的 `impactScope` 自动推导，使审阅者能优先关注影响范围更大的变更。

5. **注册表缓存**：Diff 策略和应用方法的注册表在模块级别缓存为单例，所有路由共享同一实例。

6. **延迟应用**：变更条目在 Changeset 被审阅通过并明确调用 `applyChangeSet()` 后才真正写入。这允许 Changeset 在应用前被审阅、拒绝或回滚。
