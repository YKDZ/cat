---
description: Dependency and migration boundary for @cat/db — runtime access stays in domain/app, with explicit test exceptions.
paths:
  - "packages/db/**/*.{ts,js}"
  - "packages/*/package.json"
  - "@cat-plugin/*/package.json"
  - "apps/*/package.json"
---

# @cat/db 依赖与迁移规范

## 正面限制

1. **`@cat/db` 只应出现在确实需要数据库引导、领域执行或测试基础设施的包里。** 当前允许的消费者是：
   - `@cat/domain`
   - `@cat/app`
   - `@cat/app-e2e`（以 `devDependencies` 形式依赖）
   - `@cat/test-utils`（以 `peerDependencies` 形式声明）
2. **其他功能包、插件和应用应通过 `@cat/domain` 访问数据。** 新的数据访问需求优先落在 `packages/domain/src/queries/`、`packages/domain/src/commands/` 和 capability 层。
3. **schema 变更统一走自动生成流程。** 修改 `packages/db/src/drizzle/schema/` 或 `packages/shared/src/schema/enum.ts` 后，应生成 migration，并重新生成 shared Zod schema。

## 负面限制

1. **不要**在其他 package / app / plugin 的 `dependencies`、`devDependencies` 或 `peerDependencies` 里新增 `@cat/db`。
2. **不要**在普通功能包或插件源码中直接导入 `@cat/db`、Drizzle schema 或 raw SQL；这些访问应落在 `packages/domain`。
3. **不要**手改自动生成的 migration SQL；如果生成结果不对，回源修 schema 再重新生成。
4. **不要**只提交 schema 变更而漏掉 migration 或共享 schema 生成产物。

## 例子

```jsonc
// ✅ Allowed — packages/domain/package.json
{ "dependencies": { "@cat/db": "workspace:*" } }

// ✅ Allowed — apps/app/package.json
{ "dependencies": { "@cat/db": "workspace:*" } }

// ✅ Allowed — apps/app-e2e/package.json
{ "devDependencies": { "@cat/db": "workspace:*" } }

// ✅ Allowed — packages/test-utils/package.json
{ "peerDependencies": { "@cat/db": "workspace:*" } }

// ❌ Forbidden — any other package.json
{ "dependencies": { "@cat/db": "workspace:*" } }
```

## Schema 变更流程

1. **优先生成自动 migration。**

   ```bash
   pnpm nx drizzle:generate db
   ```

2. **只审查生成结果，不直接手改。** 如果 SQL 不正确，应修 schema 源文件后重新生成。
3. **只有 Drizzle Kit 无法表达的场景才使用 custom migration。**

   ```bash
   pnpm --dir packages/db drizzle:generate -- --custom --name=<descriptive-name>
   ```

   使用 custom migration 时，需要在 PR / commit message 中说明为什么不能走自动生成。

4. **schema / enum 变更后重新生成共享 Zod schema。**

   ```bash
   pnpm nx codegen-schemas db
   ```

5. **应用 migration 到开发数据库。**

   ```bash
   pnpm nx drizzle:migrate db
   ```

## 作用域说明

本文件负责 **依赖边界 + schema 变更流程**。插件源码如何消费领域能力，单独遵循 `plugin-db-access.md`。
