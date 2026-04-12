---
description: Database naming convention — rely on Drizzle auto-generated names for columns, indexes, and constraints.
paths: ["packages/db/src/drizzle/schema/schema.ts"]
---

# 数据库命名规范

## 正面限制

1. **常规列、纯列索引和纯列唯一约束，优先依赖 Drizzle 自动命名。** TypeScript 属性名就是默认的单一来源。
2. **让 schema 定义保持最小冗余。** 当 Drizzle 已能稳定推导数据库名称时，不要再手写一份同义名称。
3. **只有 expression index 需要显式命名。** 涉及 `` sql`...` `` 表达式的索引，Drizzle 无法自动生成名称，此时必须手写名字。

## 负面限制

1. **不要**给普通列传入冗余的数据库列名。
2. **不要**给仅基于列的 `index()`、`unique()`、`uniqueIndex()` 硬编码名称。
3. **不要**把手写 snake_case / 自定义数据库名当默认做法；除非表达式索引需要，否则让 Drizzle 根据属性名映射即可。

## 例子

### 普通列

```ts
// ✅ Correct
status: text().notNull(),
creatorId: uuid().notNull(),

// ❌ Wrong
status: text("status").notNull(),
creator_id: uuid("creator_id").notNull(),
```

### 纯列索引 / 唯一约束

```ts
// ✅ Correct
index().using("btree", table.projectId.asc().nullsLast()),
unique().on(table.languageId, table.text, table.termConceptId),

// ❌ Wrong
index("my_custom_idx").using("btree", table.projectId.asc().nullsLast()),
unique("my_custom_unique").on(table.languageId, table.text),
```

### expression index：必须显式命名

```ts
// ✅ Correct
index("idx_term_text_trgm").using("gin", sql`${table.text} gin_trgm_ops`),

// ❌ Wrong
index().using("gin", sql`${table.text} gin_trgm_ops`),
```
