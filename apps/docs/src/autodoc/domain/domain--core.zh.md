# 领域核心模型

> **Section**: 领域模型  ·  **Subject ID**: `domain/core`

`@cat/domain` 是 CAT 系统的领域模型层，采用 CQRS（命令查询职责分离）模式，将所有写操作建模为 Command、所有读操作建模为 Query，并通过领域事件实现跨聚合的异步通知。

## 命令（Command）

命令代表一次带副作用的写操作，每个命令的执行结果由 `Command<C, R>` 类型描述：

- `result`（`R`）：执行成功后的返回值（如新建实体的 ID）。
- `events`：本次命令产生的零或多个 `DomainEvent`，由上层服务发布到 `DomainEventBus`。

领域层目前定义了 **135+** 条命令，覆盖 Project、Document、Element、Translation、Glossary、TranslationMemory、File、VCS、Agent、Auth 等聚合的所有写入场景。

## 查询（Query）

查询只读取数据，不产生任何副作用。Query 接口为 `Query<Q, R>`，`R` 是返回值类型。所有 **182+** 条查询由 `QueryHandler` 实现，可以直接注入数据库访问层（跳过写模型），充分利用读优化。

## 领域事件（DomainEvent）

`DomainEventMap` 定义了系统中 **60+** 种事件类型与其载荷类型的映射，例如：

- `element:created` / `element:updated` / `element:deleted`
- `translation:submitted` / `translation:approved`
- `pr:created` / `pr:merged` / `pr:closed`
- `tm:record_added` / `term:added`
- `agent:run_started` / `agent:run_finished`

`DomainEventBus`（来自 `@cat/core`）承载全局发布-订阅，命令执行后由服务层调用 `publishEvents(events)` 批量分发；各领域服务或工作流任务可订阅特定事件以触发后续处理（如 `element:created` → 自动翻译流程）。

## VCS 感知

部分命令（如 `submitTranslation`、`applyChangeset`）接受可选的 `vcsContext`（含分支 ID、模式），使写操作透明地路由到 `@cat/vcs` 的 Changeset 层，而非直接落库，从而支持隔离模式下的草稿翻译。

## 聚合组织

| 聚合                 | 主要命令/查询                      |
| -------------------- | ---------------------------------- |
| Project / Document   | 创建/归档/配置，以及文档元数据管理 |
| Element              | 可翻译元素的 CRUD 与批量导入       |
| Translation          | 提交、审核、自动填充               |
| Glossary / Term      | 术语库条目管理                     |
| TranslationMemory    | 记忆记录入库与检索                 |
| VCS / PR / Changeset | 分支、变更集、拉取请求全生命周期   |
| Agent / AgentRun     | Agent 会话与运行记录               |
