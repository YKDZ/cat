# 图计算引擎

> **Section**: 基础设施  ·  **Subject ID**: `infra/graph`

`@cat/graph` 是整个 CAT 系统中图计算与黑板数据共享的基础层，被 `@cat/workflow`（顺序工作流）和 `@cat/agent`（ReAct 循环）共同复用。

## 图定义（GraphDefinition）

`GraphDefinition` 以声明式方式描述 DAG 拓扑：

- **节点**（`NodeDefinition`）：具备类型标识、重试配置（`RetryConfig`）和超时设定。
- **边**（`EdgeDefinition`）：连接两个节点，可携带可选的 `EdgeCondition`；满足条件的边决定后续路由目标。
- **入口 / 出口**：`entry` 为起始节点 ID，`exit` 为终止节点 ID 列表。

图本身只是数据结构，执行器（Executor）负责实际遍历与调度。

## 黑板机制（Blackboard）

黑板是节点间传递状态的版本化共享内存。每次写入以 `Patch` 的形式提交，包含：

- `PatchMetadata`：记录 `patchId`、`parentSnapshotVersion`、`actorId`、`timestamp`。
- `updates`：键值对映射，支持点分隔路径（如 `"user.name"`）实现嵌套写入（`setByPath`）。

应用补丁时系统校验 `parentSnapshotVersion`，防止并发竞态；`deepMerge` 用于将补丁数据合并到现有快照。

`BlackboardSnapshot` 包含当前版本号与完整数据对象，是节点读取状态的唯一来源。

## 条件路由（EdgeCondition）

`evaluateCondition(condition, data)` 对快照数据求值结构化条件，支持操作符：

| 操作符                  | 含义            |
| ----------------------- | --------------- |
| `eq` / `neq`            | 严格相等 / 不等 |
| `exists` / `not_exists` | 字段非空 / 为空 |
| `in`                    | 值在数组中      |
| `gt` / `lt`             | 数值大于 / 小于 |

`resolvePath(data, "a.b.c")` 用于从嵌套对象中按点分隔路径提取字段值；`parseExpectedValue` 将字符串字面量转为类型化原始值（boolean、number、null 或 string），避免类型比较歧义。

## 相关主题

- [`domain/core`](../domain/domain--core.zh.md)
