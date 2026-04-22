# Permissions System

> **Section**: Infra  ·  **Subject ID**: `infra/permissions`

**Primary package**: `@cat/permissions`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `registerAuditHandler` | function | 注册 handler：批量写入 authAuditLog 表。
使用微批处理（收集 50 条或每 5 秒，一次 batch insert）。 |
| `AuditEventMap` | type |  |
| `AuditEvent` | type |  |
| `AuditEventType` | type |  |
| `createPermissionCache` | function | 封装 CacheStore 的权限缓存辅助函数。
直接使用 createPermissionEngine 注入的 CacheStore（即 RedisCache |
| `PermissionCache` | type |  |
| `createPermissionEngine` | function |  |
| `PermissionEngine` | type |  |
| `isRelationImplied` | function | 检查 requiredRelation 是否被 heldRelation 隐含（同一资源类型内）。
例如：持有 "owner" 即隐含 "editor" 和 " |
| `TransitiveRule` | type | 跨资源传递性规则。
语义：如果 subject 对 parentObject 有 parentRelation，
      则隐含对 childObject  |
| `AscendRule` | type | "上溯"规则：element/translation 没有自己的权限元组，
鉴权时自动查找所属 document。 |
| `seedSystemRoles` | function | 系统启动时调用（幂等）：确保 4 个系统角色存在。
使用 INSERT ... ON CONFLICT DO NOTHING。 |
| `grantFirstUserSuperadmin` | function | 在 createAccount 注册流程后调用。
检查是否为首位用户：若是，自动授予 system#superadmin 权限元组，
并将 setting "s |
| `loadUserSystemRoles` | function | 加载用户的系统角色列表（通过权限元组查询）。
返回用户对 system:* 持有的所有 relation 列表。 |
| `getPermissionEngine` | function | 获取全局单例 PermissionEngine。
必须在调用前先通过 initPermissionEngine 初始化。 |
| `initPermissionEngine` | function | 初始化全局 PermissionEngine 单例。
在应用启动时调用一次。 |
| `determineWriteMode` | function | Determine the write mode (Direct / Isolation) for a subject on a project. |
| `CompletedFactor` | type | 完成的认证因子信息 |
| `AuthContext` | type | 鉴权上下文，在各入口层创建后透传 |
| `ObjectRef` | type | 引用某个具体对象 |
| `SubjectRef` | type | 引用某个主体 |

## Related Topics

- [`domain/core`](../domain/domain--core.en.md)
