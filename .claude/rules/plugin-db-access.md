---
description: Database access rules for plugin development under @cat-plugin/.
paths: ["@cat-plugin/**/*.{ts,vue}"]
---

# 插件数据访问规范

## 正面限制

1. **`@cat-plugin/**`下的插件代码必须通过注入的`PluginCapabilities` 访问数据。\*\*
2. **`PluginCapabilities` 的导入来源遵循当前子系统约定。** 它可能直接来自 `@cat/domain`，也可能由 `@cat/plugin-core` 重导出。
3. **现有 capability 不够用时，先扩领域层。** 新的数据访问需求应先在 `packages/domain/` 中补 query / command，再把它挂进 capability，最后由插件消费。

## 负面限制

1. **不要**在插件源码中导入 `@cat/db`、`@cat/db/*`、Drizzle schema、raw SQL、`DbHandle` 或 `DbContext`。
2. **不要**在插件内部自行开启数据库事务或依赖底层 ORM 细节。
3. **不要**通过给插件 `package.json` 增加 `@cat/db` 来绕过 capability 边界。

## 例子

### 推荐：使用注入的 capability

```ts
await this.capabilities.project.get({ id: projectId });
await this.capabilities.translation.updateUnit({ ... });
```

### 避免：直接访问数据库

```ts
import { db } from "@cat/db";
import { projects } from "@cat/db/schema";

db.select().from(projects).where(...);
```

### capability 不够用时的正确路径

1. 在 `packages/domain/src/queries/` 或 `packages/domain/src/commands/` 中新增能力
2. 定义对应的 Zod input schema
3. 接入 `packages/domain/src/capabilities/`
4. 回到插件侧通过 `PluginCapabilities` 消费
