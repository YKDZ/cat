---
description: Database naming convention — rely on Drizzle auto-generated names for columns, indexes, and constraints.
paths: ["packages/db/src/drizzle/schema/schema.ts"]
---

# Database Naming Convention

## Rule: Rely on Auto-Generated Names

Drizzle ORM automatically generates database names for columns, indexes, unique constraints, and other identifiers based on the TypeScript property names and table names. **Do not** manually specify these names — let Drizzle handle it.

### Columns

Do **not** pass a custom database column name to column builder functions. The TypeScript property name is the single source of truth.

```typescript
// ✅ Correct — Drizzle auto-generates the column name
status: text().notNull(),
creatorId: uuid().notNull(),

// ❌ Wrong — manually specified column name
status: text("status").notNull(),
creator_id: uuid("creator_id").notNull(),
```

### Indexes and Constraints

Do **not** pass a custom name to `index()`, `unique()`, or `uniqueIndex()` when the index is on **columns only** (not expressions). Drizzle auto-generates deterministic names for these.

```typescript
// ✅ Correct — auto-generated index name
index().using("btree", table.projectId.asc().nullsLast()),
unique().on(table.languageId, table.text, table.termConceptId),

// ❌ Wrong — unnecessary manual index name
index("my_custom_idx").using("btree", table.projectId.asc().nullsLast()),
unique("my_custom_unique").on(table.languageId, table.text),
```

## Exception: Expression-Based Indexes

When an index uses a raw SQL **expression** (via `` sql`...` ``), Drizzle **cannot** auto-generate a name. In this case, you **must** provide an explicit name. This is the only scenario where a manual name is allowed.

```typescript
// ✅ Correct — expression index requires a manual name
index("idx_term_text_trgm").using("gin", sql`${table.text} gin_trgm_ops`),

// ❌ Wrong — expression index without a name (drizzle-kit generate will fail)
index().using("gin", sql`${table.text} gin_trgm_ops`),
```

## Why

- **Consistency**: Drizzle's auto-generated names follow a deterministic pattern, ensuring consistency across the schema.
- **Reduced drift**: Manual names can diverge from property names, causing confusion between TypeScript code and the actual database.
- **Migration safety**: `drizzle-kit generate` uses auto-generated names to track renames and changes; manual names can trigger false-positive interactive rename prompts during migration generation.
