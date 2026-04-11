---
description: Typing rules for database JSONB columns — always use JSONType/NonNullJSONType from @cat/shared.
paths:
  [
    "packages/domain/**/*.ts",
    "packages/db/**/*.ts",
    "packages/operations/**/*.ts",
    "packages/workflow/**/*.ts",
    "@cat-plugin/**/*.ts",
  ]
---

# JSONB Column Typing Rules

## 1. Never Use `unknown` for JSONB Values

When typing database JSONB column inputs or outputs, **never** use:

- `unknown` as the TypeScript type
- `z.unknown()` as the Zod schema
- `Record<string, unknown>` as a substitute

Instead, use the canonical JSON types from `@cat/shared/schema/json`:

| Scenario                                  | TypeScript Type   | Zod Schema            |
| ----------------------------------------- | ----------------- | --------------------- |
| Nullable JSON value (default for jsonb)   | `JSONType`        | `safeZDotJson`        |
| Non-null JSON value (`.notNull()` column) | `NonNullJSONType` | `nonNullSafeZDotJson` |
| JSON object specifically                  | `JSONObject`      | `JSONObjectSchema`    |
| JSON Schema metadata                      | `_JSONSchema`     | `_JSONSchemaSchema`   |

## 2. Import Path

```typescript
import type {
  JSONType,
  NonNullJSONType,
  JSONObject,
} from "@cat/shared/schema/json";
import { safeZDotJson, nonNullSafeZDotJson } from "@cat/shared/schema/json";
```

## 3. DB Schema Annotations

Every `jsonb()` column in `@cat/db` schema **must** have a `.$type<T>()` annotation:

```typescript
// ✅ Correct
meta: jsonb("meta").$type<JSONType>(),
value: jsonb("value").$type<NonNullJSONType>().notNull(),

// ❌ Wrong — loses type information
meta: jsonb("meta"),
value: jsonb("value").notNull(),
```

## 4. Domain Command/Query Typing

- **Command Zod schemas**: Use `safeZDotJson` / `nonNullSafeZDotJson` for JSONB input fields
- **Query return types**: Use `JSONType` / `NonNullJSONType` for JSONB output fields
- **Never** cast query results with `as JSONType` when the query already returns the correct type

## 5. Downstream Consumer Rules

When consuming domain query results that return JSON types:

- Do **not** add `as JSONType` or `as NonNullJSONType` casts — the type flows naturally
- Do **not** add `oxlint-disable` comments for type assertions that are no longer needed
- When narrowing `JSONType` to `JSONObject`, use standard type guards (`typeof x === "object" && x !== null && !Array.isArray(x)`) — TypeScript will narrow correctly
