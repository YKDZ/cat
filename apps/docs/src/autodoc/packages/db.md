# @cat/db

Database layer: Drizzle ORM schemas and Redis client

## Overview

* **Modules**: 10

* **Exported functions**: 9

* **Exported types**: 6

## Function Index

### packages/db/src/drizzle/migrations

### `backfillDirectEditor`

```ts
/**
 * One-time migration: grant direct_editor to all existing project editor/admin/owner subjects.
 * This preserves the previous trust-by-default behaviour for existing projects.
 */
export async function backfillDirectEditor(db: DbHandle): Promise<void>
```

### packages/db/src/utils

### `increment`

```ts
export const increment = (column: T, amount: number): T
```

### `decrement`

```ts
export const decrement = (column: T, amount: number): T
```

### `getAccountMetaByIdentity`

```ts
export const getAccountMetaByIdentity = async (drizzle: DrizzleClient | DrizzleTransaction, userId: string, providedAccountId: string, providerIssuer: string): Promise<JSONType>
```

### `ensureDB`

```ts
/**
 * 在应用启动前执行 \
 * 用于维护数据库中的基本条目 \
 * 不删除现有数据 \
 * 所有修改都是试探性的
 * @returns
 */
export const ensureDB = async (db: DrizzleDB): Promise<void>
```

### `ensureRootUser`

```ts
/**
 * 确保根管理员存在
 * 只有在第一次创建管理员时才为他分配根角色
 * 也即允许根角色和其默认的密码账户被从根管理员处移除
 */
export const ensureRootUser = async (tx: DrizzleTransaction): Promise<void>
```

### `mimeFromFileName`

```ts
export const mimeFromFileName = async (drizzle: DrizzleClient, fileName: string): Promise<string>
```

### `hashPassword`

```ts
export const hashPassword = async (password: string): Promise<string>
```

### `verifyPassword`

```ts
export const verifyPassword = async (password: string, storedSaltHash: string): Promise<boolean>
```

## Type Index

* `DrizzleClient` (type)

* `DrizzleTransaction` (type)

* `DrizzleSchema` (type)

* `DefaultSettingData` (type)

* `GeneratedDeclaration` (type)

* `GeneratedFileSpec` (type)
