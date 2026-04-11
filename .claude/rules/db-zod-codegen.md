---
description: Every new table in schema.ts must be registered in generators.ts for Zod codegen.
applyTo: "packages/db/src/drizzle/schema/schema.ts, packages/db/src/zod/generators.ts"
---

# Zod Codegen Registration for New Tables

Every table added to `packages/db/src/drizzle/schema/schema.ts` **must** be registered in `packages/db/src/zod/generators.ts` so that a reusable Zod schema is generated into the `@cat/shared` package.

## Required Steps

### 1. Import the table in `generators.ts`

Add the new table to the import block from `../drizzle/schema/schema.ts`:

```ts
import {
  // ... existing tables
  myNewTable,
} from "../drizzle/schema/schema.ts";
```

### 2. Add to the `SelectSchemaTable` union

```ts
type SelectSchemaTable =
  | // ... existing tables
  | typeof myNewTable;
```

### 3. Register a declaration in `generatedSharedSchemaFiles`

Add a `TableDeclaration` entry inside the appropriate `outputFile` group (or create a new group if the table belongs to a new domain):

```ts
{
  kind: "table",
  schemaExportName: "MyNewTableSchema",
  typeExportName: "MyNewTable",
  buildShape: buildSelectShape(myNewTable),
  // Optional: override columns that need custom Zod types
  overrides: {
    meta: "safeZDotJson.nullable()",
  },
},
```

### 4. Run codegen

After registration, run the codegen command so the shared Zod schema file is generated/updated:

```bash
pnpm nx codegen-schemas db
```

## Common `overrides`

| Column pattern | Override value |
|---|---|
| Nullable JSONB | `"safeZDotJson.nullable()"` |
| Non-null JSONB | `"nonNullSafeZDotJson"` |
| Email field | `"z.email()"` |
| URL field | `"z.url().nullable()"` |

## Why

- The generated Zod schemas are the **single source of truth** for row types consumed by the rest of the monorepo (`@cat/shared/schema/generated/*`).
- Forgetting to register a table means other packages cannot import a validated schema or inferred type for that table, leading to manual type duplication.
