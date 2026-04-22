# Database Access Layer

> **Section**: Infra  ·  **Subject ID**: `infra/db`

**Primary package**: `@cat/db`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `DrizzleClient` | type |  |
| `DrizzleTransaction` | type |  |
| `backfillDirectEditor` | function | One-time migration: grant direct_editor to all existing project editor/admin/own |
| `DrizzleSchema` | type |  |
| `increment` | function |  |
| `decrement` | function |  |
| `getAccountMetaByIdentity` | function |  |
| `ensureDB` | function | 在应用启动前执行 \
用于维护数据库中的基本条目 \
不删除现有数据 \
所有修改都是试探性的
@returns |
| `ensureRootUser` | function | 确保根管理员存在
只有在第一次创建管理员时才为他分配根角色
也即允许根角色和其默认的密码账户被从根管理员处移除 |
| `mimeFromFileName` | function |  |
| `hashPassword` | function |  |
| `verifyPassword` | function |  |
| `DefaultSettingData` | type |  |
| `GeneratedDeclaration` | type |  |
| `GeneratedFileSpec` | type |  |
