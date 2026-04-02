# @cat/permissions

Permission system: ReBAC-based access control

## Overview

- **Modules**: 8
- **Exported functions**: 9
- **Exported types**: 10

## Function Index

### src

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `getPermissionEngine` | - | `PermissionEngine` | 获取全局单例 PermissionEngine。
必须在调用前先通过 initPermissionEngine 初始化。 |
| `initPermissionEngine` | deps | `PermissionEngine` | 初始化全局 PermissionEngine 单例。
在应用启动时调用一次。 |
| `seedSystemRoles` | db | `Promise<void>` | 系统启动时调用（幂等）：确保 4 个系统角色存在。
使用 INSERT ... ON CONFLICT DO NOTHING。 |
| `grantFirstUserSuperadmin` | db, userId | `Promise<void>` | 在 createAccount 注册流程后调用。
检查是否为首位用户：若是，自动授予 system#superadmin 权限元组，
并将 setting "system:first_user_registered" 设置为 true。 |
| `loadUserSystemRoles` | db, userId | `Promise<("superadmin" | "admin" | "owner" | "editor" | "viewer" | "member")[]>` | 加载用户的系统角色列表（通过权限元组查询）。
返回用户对 system:* 持有的所有 relation 列表。 |
| `isRelationImplied` | objectType, heldRelation, requiredRelation | `boolean` | 检查 requiredRelation 是否被 heldRelation 隐含（同一资源类型内）。
例如：持有 "owner" 即隐含 "editor" 和 "viewer"。 |
| `createPermissionEngine` | deps | `PermissionEngine` | - |
| `createPermissionCache` | store | `PermissionCache` | 封装 CacheStore 的权限缓存辅助函数。
直接使用 createPermissionEngine 注入的 CacheStore（即 RedisCacheStore）。 |
| `registerAuditHandler` | db | `() => void` | 注册 handler：批量写入 authAuditLog 表。
使用微批处理（收集 50 条或每 5 秒，一次 batch insert）。 |

## Type Index

| Type | Kind | Description |
|------|------|-------------|
| `AuthContext` | type | 鉴权上下文，在各入口层创建后透传 |
| `ObjectRef` | type | 引用某个具体对象 |
| `SubjectRef` | type | 引用某个主体 |
| `TransitiveRule` | type | 跨资源传递性规则。
语义：如果 subject 对 parentObject 有 parentRelation，
      则隐含对 childObject 有 childRelation。
resolveParentId：给定 child object ID，查 DB 返回 parent object ID。 |
| `AscendRule` | type | "上溯"规则：element/translation 没有自己的权限元组，
鉴权时自动查找所属 document。 |
| `PermissionEngine` | type | - |
| `PermissionCache` | type | - |
| `AuditEventMap` | type | - |
| `AuditEvent` | type | - |
| `AuditEventType` | type | - |


*Last updated: 2026-04-02*