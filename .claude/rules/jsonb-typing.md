---
description: Typing rules for database JSONB columns — require explicit .$type<T>() and prefer the most specific shared/domain type.
paths:
  [
    "packages/domain/**/*.ts",
    "packages/db/**/*.ts",
    "packages/operations/**/*.ts",
    "packages/workflow/**/*.ts",
    "@cat-plugin/**/*.ts",
  ]
---

# JSONB 列类型规范

## 正面限制

1. **每个 `jsonb()` 列都必须显式写 `.$type<T>()`。** 不要让 JSONB 列停留在未注解状态。
2. **优先使用“最具体、最稳定”的类型。**
   - 通用 / 非结构化 JSON：使用 `JSONType` / `NonNullJSONType`
   - 明确要求 object 的 JSON：使用 `JSONObject` / `_JSONSchema`
   - 领域内已知结构：使用精确类型，例如 `string[]`、`AgentLLMConfig | null` 等
3. **在命令、查询和能力层延续列的真实类型。** 如果 schema 已经精确建模，调用方不应再靠后置断言修正类型。
4. **Zod 层保持一致。** 通用 JSON 字段使用 `safeZDotJson` / `nonNullSafeZDotJson`；结构化 JSON 字段使用对应的精确 Zod schema，必要时在 `packages/db/src/zod/generators.ts` 里写 override。

## 负面限制

1. **不要**把持久化 JSONB 字段偷懒写成 `unknown`、`z.unknown()` 或 `Record<string, unknown>`。
2. **不要**遗漏 `.$type<T>()`。
3. **不要**把领域内已知结构的 JSONB 字段降级成宽泛的 `JSONType`，仅仅因为它“存的是 jsonb”。
4. **不要**在查询结果出来之后再用 `as JSONType` / `as NonNullJSONType` 补类型；如果 schema 对了，返回类型本来就应该对。

## 例子

### 导入路径

```ts
import type { JSONType, NonNullJSONType, JSONObject } from "@cat/shared";
import { safeZDotJson, nonNullSafeZDotJson } from "@cat/shared";
```

### 通用 JSON 字段

```ts
// ✅ Correct
meta: jsonb().$type<JSONType>(),
value: jsonb().$type<NonNullJSONType>().notNull(),

// ❌ Wrong
meta: jsonb(),
value: jsonb().notNull(),
```

### 结构化 JSON 字段

```ts
// ✅ Correct
labels: jsonb().$type<string[]>().notNull().default([]),
llmConfig: jsonb().$type<AgentLLMConfig | null>(),
schema: jsonb().notNull().$type<_JSONSchema>(),

// ❌ Wrong
labels: jsonb().$type<unknown>(),
llmConfig: jsonb().$type<Record<string, unknown>>(),
```
