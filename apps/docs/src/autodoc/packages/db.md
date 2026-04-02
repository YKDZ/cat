# @cat/db

Database layer: Drizzle ORM schemas and Redis client

## Overview

- **Modules**: 17
- **Exported functions**: 8
- **Exported types**: 6

## Function Index

### src

*No exported functions*

### src/zod

*No exported functions*

### src/utils

| Function | Parameters | Return Type | Description |
|----------|------------|-------------|-------------|
| `hashPassword` | password | `Promise<string>` | - |
| `verifyPassword` | password, storedSaltHash | `Promise<boolean>` | - |
| `mimeFromFileName` | drizzle, fileName | `Promise<string>` | - |
| `ensureDB` | db | `Promise<void>` | 在应用启动前执行 \
用于维护数据库中的基本条目 \
不删除现有数据 \
所有修改都是试探性的 |
| `ensureRootUser` | tx | `Promise<void>` | 确保根管理员存在
只有在第一次创建管理员时才为他分配根角色
也即允许根角色和其默认的密码账户被从根管理员处移除 |
| `getAccountMetaByIdentity` | drizzle, userId, providedAccountId, providerIssuer | `Promise<JSONType>` | - |
| `increment` | column, amount | `T` | - |
| `decrement` | column, amount | `T` | - |

### src/drizzle

*No exported functions*

### src/utils/settings

*No exported functions*

### src/utils/languages

*No exported functions*

### src/drizzle/schema

*No exported functions*

## Type Index

| Type | Kind | Description |
|------|------|-------------|
| `GeneratedDeclaration` | type | - |
| `GeneratedFileSpec` | type | - |
| `DrizzleSchema` | type | - |
| `DrizzleClient` | type | - |
| `DrizzleTransaction` | type | - |
| `DefaultSettingData` | type | - |


*Last updated: 2026-04-02*