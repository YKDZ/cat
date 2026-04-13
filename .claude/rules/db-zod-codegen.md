---
description: Every new table in schema.ts must be registered in generators.ts for Zod codegen.
paths:
  [
    "packages/db/src/drizzle/schema/schema.ts, packages/db/src/zod/generators.ts",
  ]
---

# 新表的 Zod Codegen 注册规范

## 正面限制

1. **每当你在 `packages/db/src/drizzle/schema/schema.ts` 新增表时，必须同步注册 `packages/db/src/zod/generators.ts`。**
2. **生成产物统一落到 `packages/shared/src/schema/drizzle/`。** 其他包应通过 `@cat/shared/schema/drizzle/*` 消费这些 schema，而不是手写平行类型。
3. **注册动作至少包含四步。**
   - 在 `generators.ts` 导入新表
   - 加入 `SelectSchemaTable` union
   - 在 `generatedSharedSchemaFiles` 中补 `TableDeclaration`
   - 运行 `pnpm moon run db:codegen-schemas`

## 负面限制

1. **不要**只改 `schema.ts` 而忘记更新 `generators.ts`。
2. **不要**手动创建或编辑 `packages/shared/src/schema/drizzle/**` 下的生成文件；生成结果不对时，应回源修改 `schema.ts` / `generators.ts` 后重新跑 codegen。
3. **不要**把新表放进错误的 `outputFile` 分组；已有领域分组存在时应沿用该分组。

## 例子

### 1. 在 `generators.ts` 中导入新表

```ts
import {
  // ... existing tables
  myNewTable,
} from "../drizzle/schema/schema.ts";
```

### 2. 加入 `SelectSchemaTable` union

```ts
type SelectSchemaTable =
  | // ... existing tables
  | typeof myNewTable;
```

### 3. 在 `generatedSharedSchemaFiles` 中注册声明

```ts
{
  kind: "table",
  schemaExportName: "MyNewTableSchema",
  typeExportName: "MyNewTable",
  buildShape: buildSelectShape(myNewTable),
  overrides: {
    meta: "safeZDotJson.nullable()",
  },
},
```

### 4. 运行 codegen

```bash
pnpm moon run db:codegen-schemas
```

## 常见 `overrides`

| Column pattern | Override value              |
| -------------- | --------------------------- |
| Nullable JSONB | `"safeZDotJson.nullable()"` |
| Non-null JSONB | `"nonNullSafeZDotJson"`     |
| Email field    | `"z.email()"`               |
| URL field      | `"z.url().nullable()"`      |
