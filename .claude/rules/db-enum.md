---
description: Database enum values must be declared in @cat/shared and reused in schema.ts via pgEnum.
paths: ["packages/shared/src/schema/enum.ts", "packages/db/src/drizzle/schema/schema.ts"]
---

# Database Enum Convention

All database-related enums **must** follow a two-step declaration pattern. Do **not** inline string literals or define enum values directly in `schema.ts`.

## Step 1 — Declare in `packages/shared/src/schema/enum.ts`

For each enum, export three artifacts:

```ts
// 1. Values tuple (used by both pgEnum and Zod)
export const FooStatusValues = ["A", "B", "C"] as const;

// 2. Zod schema
export const FooStatusSchema = z.enum(FooStatusValues);

// 3. TypeScript type
export type FooStatus = (typeof FooStatusValues)[number];
```

## Step 2 — Reuse in `packages/db/src/drizzle/schema/schema.ts`

Import the `*Values` constant and pass it to `pgEnum`:

```ts
import { FooStatusValues } from "@cat/shared/schema/enum";
import { pgEnum } from "drizzle-orm/pg-core";

export const fooStatus = pgEnum("FooStatus", FooStatusValues);
```

Then use the resulting enum in table columns:

```ts
export const someTable = pgTable("SomeTable", {
  status: fooStatus().notNull().default("A"),
});
```

## Why

- **Single source of truth**: Enum values are defined once in `@cat/shared`, which is isomorphic and importable by every package.
- **Type safety across layers**: The Zod schema and TS type derived from the same `Values` tuple keep API validation, frontend code, and database schema in sync.
- **Prevents drift**: Adding/removing a member in one place automatically propagates everywhere.
