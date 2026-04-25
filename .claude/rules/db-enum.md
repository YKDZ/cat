---
description: Database enum values must be declared in @cat/shared and reused in schema.ts via pgEnum.
paths:
  [
    "packages/shared/src/schema/enum.ts",
    "packages/db/src/drizzle/schema/schema.ts",
  ]
---

# 数据库枚举规范

## 正面限制

1. **所有数据库枚举都必须走“两处协作、单一来源”的模式。**
   - 在 `packages/shared/src/schema/enum.ts` 中声明共享枚举值、Zod schema 和 TypeScript 类型
   - 在 `packages/db/src/drizzle/schema/schema.ts` 中仅复用 `*Values`，通过 `pgEnum()` 建立 PostgreSQL enum
2. **共享层是枚举值的唯一来源。** 前后端、Zod 校验和数据库 schema 都应从同一组 `*Values` 推导。

## 负面限制

1. **不要**在 `schema.ts` 中内联字符串字面量数组。
2. **不要**在 `packages/db` 里再维护一份重复的 enum values tuple。
3. **不要**只建 PostgreSQL enum，却不在 `@cat/shared` 同步暴露对应的 Zod schema 和 TS 类型。

## 例子

### Step 1：在 `packages/shared/src/schema/enum.ts` 中声明

```ts
export const FooStatusValues = ["A", "B", "C"] as const;
export const FooStatusSchema = z.enum(FooStatusValues);
export type FooStatus = (typeof FooStatusValues)[number];
```

### Step 2：在 `packages/db/src/drizzle/schema/schema.ts` 中复用

```ts
import { FooStatusValues } from "@cat/shared";
import { pgEnum } from "drizzle-orm/pg-core";

export const fooStatus = pgEnum("FooStatus", FooStatusValues);

export const someTable = pgTable("SomeTable", {
  status: fooStatus().notNull().default("A"),
});
```
