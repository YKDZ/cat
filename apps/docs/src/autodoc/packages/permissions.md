# @cat/permissions

Permission system: ReBAC-based access control

## Overview

* **Modules**: 8

* **Exported functions**: 10

* **Exported types**: 11

## Function Index

### packages/permissions/src

### `registerAuditHandler`

```ts
/**
 * 注册 handler：批量写入 authAuditLog 表。
 * 使用微批处理（收集 50 条或每 5 秒，一次 batch insert）。
 */
export const registerAuditHandler = (db: DbHandle): () => void
```

### `createPermissionCache`

```ts
/**
 * 封装 CacheStore 的权限缓存辅助函数。
 * 直接使用 createPermissionEngine 注入的 CacheStore（即 RedisCacheStore）。
 */
export const createPermissionCache = (store: CacheStore): PermissionCache
```

### `createPermissionEngine`

```ts
export const createPermissionEngine = (deps: {
  db: DbHandle;
  cache: CacheStore;
  auditEnabled: boolean;
}): PermissionEngine
```

### `isRelationImplied`

```ts
/**
 * 检查 requiredRelation 是否被 heldRelation 隐含（同一资源类型内）。
 * 例如：持有 "owner" 即隐含 "editor" 和 "viewer"。
 */
export const isRelationImplied = (objectType: ObjectType, heldRelation: Relation, requiredRelation: Relation): boolean
```

### `seedSystemRoles`

```ts
/**
 * 系统启动时调用（幂等）：确保 4 个系统角色存在。
 * 使用 INSERT ... ON CONFLICT DO NOTHING。
 */
export const seedSystemRoles = async (db: DbHandle): Promise<void>
```

### `grantFirstUserSuperadmin`

```ts
/**
 * 在 createAccount 注册流程后调用。
 * 检查是否为首位用户：若是，自动授予 system#superadmin 权限元组，
 * 并将 setting "system:first_user_registered" 设置为 true。
 */
export const grantFirstUserSuperadmin = async (db: DbHandle, userId: string): Promise<void>
```

### `loadUserSystemRoles`

```ts
/**
 * 加载用户的系统角色列表（通过权限元组查询）。
 * 返回用户对 system:* 持有的所有 relation 列表。
 */
export const loadUserSystemRoles = async (db: DbHandle, userId: string): Promise<("superadmin" | "admin" | "owner" | "editor" | "viewer" | "member" | "direct_editor" | "isolation_forced")[]>
```

### `getPermissionEngine`

```ts
/**
 * 获取全局单例 PermissionEngine。
 * 必须在调用前先通过 initPermissionEngine 初始化。
 */
export const getPermissionEngine = (): PermissionEngine
```

### `initPermissionEngine`

```ts
/**
 * 初始化全局 PermissionEngine 单例。
 * 在应用启动时调用一次。
 */
export const initPermissionEngine = (deps: {
  db: DbHandle;
  cache: CacheStore;
  auditEnabled?: boolean;
}): PermissionEngine
```

### `determineWriteMode`

```ts
/**
 * Determine the write mode (Direct / Isolation) for a subject on a project.
 *
 * @returns "direct" | "isolation" | "no_access"
 */
export async function determineWriteMode(engine: PermissionEngine, authCtx: AuthContext, projectId: string): Promise<"direct" | "isolation" | "no_access">
```

## Type Index

* `AuditEventMap` (type)

* `AuditEvent` (type)

* `AuditEventType` (type)

* `PermissionCache` (type)

* `PermissionEngine` (type)

* `TransitiveRule` (type) — 跨资源传递性规则。
  语义：如果 subject 对 parentObject 有 parentRelation，
  &#x20;     则隐含对 childObject 有 childRelation。
  resolveParentId：给定 child object ID，查 DB 返回 parent object ID。

* `AscendRule` (type) — "上溯"规则：element/translation 没有自己的权限元组，
  鉴权时自动查找所属 document。

* `CompletedFactor` (type) — 完成的认证因子信息

* `AuthContext` (type) — 鉴权上下文，在各入口层创建后透传

* `ObjectRef` (type) — 引用某个具体对象

* `SubjectRef` (type) — 引用某个主体
