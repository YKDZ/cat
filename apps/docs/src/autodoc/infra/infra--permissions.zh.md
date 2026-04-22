# 权限系统

> **Section**: 基础设施  ·  **Subject ID**: `infra/permissions`

`@cat/permissions` 实现了基于关系的访问控制（ReBAC），通过权限元组描述主体与资源之间的关系，并通过层级继承支持粗粒度与细粒度权限的统一管理。

## 权限元组（Permission Tuple）

每条权限以三元组形式存储：`(subject, relation, object)`。

- `subject`：主体，格式为 `user:{userId}` 或 `role:{roleId}` 或 `group:{groupId}`。
- `relation`：关系名称，如 `owner`、`member`、`reviewer`、`translator`、`viewer`。
- `object`：资源，格式为 `project:{id}`、`document:{id}`、`element:{id}` 等。

关系存在层级继承关系，例如 `owner` 隐含 `member`，`member` 隐含 `reviewer`，通过 `RELATION_HIERARCHY` 配置映射。`PermissionEngine.check(subject, relation, object)` 递归展开继承链进行判断，无需为每层单独写入元组。

## 缓存与性能

权限检查结果以 `{subject}:{relation}:{object}` 为键缓存在 Redis 中，TTL 默认 60 秒。当元组发生变更（如用户角色变更）时，`invalidate(subject, object)` 主动失效相关缓存键。

高并发场景下，`PermissionEngine.batchCheck(checks)` 以管道方式将多次 `check` 合并为一次 Redis 往返，减少延迟。

## 审计日志

所有权限检查结果均写入审计日志（`AuditLog`）：记录 `subject`、`relation`、`object`、`decision`（`allow` / `deny`）、`timestamp` 和 `requestId`。为减少写入压力，采用微批量机制（`micro-batching`）：日志先聚合到内存缓冲区，每 500 ms 或达到 100 条时批量写入数据库。

## AuthContext

`AuthContext` 封装了当前请求的身份信息（`userId`、`aal`、`completedFactors`、`sessionId`），并注入 `PermissionEngine` 实例，使业务函数可通过 `ctx.can(relation, object)` 直接校验权限，而无需手动传递 `userId`。

## 相关主题

- [`domain/core`](../domain/domain--core.zh.md)
