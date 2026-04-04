---
description: Dependency restriction for @cat/db — only @cat/domain and @cat/app may depend on it.
paths:
  - "packages/db/**/*.{ts,js}"
  - "packages/*/package.json"
  - "@cat-plugin/*/package.json"
  - "apps/*/package.json"
---

# @cat/db Package Dependency Rules

## Allowed Consumers

`@cat/db` may **only** appear as a dependency (in `package.json`) of:

- **`@cat/domain`** — the domain layer that wraps all database access as typed Queries / Commands.
- **`@cat/app`** — the main application entry point that bootstraps the database connection.

All other packages (`packages/*`, `@cat-plugin/*`, `apps/*` except `app`) **must not** list `@cat/db` in their `dependencies` or `devDependencies`.

```jsonc
// ✅ Allowed — packages/domain/package.json
{ "dependencies": { "@cat/db": "workspace:*" } }

// ✅ Allowed — apps/app/package.json
{ "dependencies": { "@cat/db": "workspace:*" } }

// ❌ Forbidden — any other package.json
{ "dependencies": { "@cat/db": "workspace:*" } }
```

## Why

1. **Single source of truth** — All schema knowledge and migration logic stays in `@cat/db`; all _business_ data access stays in `@cat/domain`. Other packages never couple to ORM internals.
2. **Permission enforcement** — Domain queries/commands are the only gate that applies `assertPermission()` checks and emits domain events.
3. **Refactoring safety** — Schema changes, migration strategies, and ORM upgrades only impact `@cat/db` + `@cat/domain`, not the wider dependency graph.

## When You Need New Database Access

If your feature requires data access that doesn't exist yet:

1. **First, check existing queries/commands** in `packages/domain/src/queries/` and `packages/domain/src/commands/` — reuse whenever possible.
2. If nothing fits, **create a new Query or Command** in `packages/domain/`:
   - Queries: `packages/domain/src/queries/<domain>/get-*.query.ts` (or `list-*`, `count-*`)
   - Commands: `packages/domain/src/commands/<domain>/create-*.cmd.ts` (or `update-*`, `delete-*`)
3. Define a Zod schema for the input, implement with the `Query<Q, R>` or `Command<C, R>` signature.
4. Wire it into the relevant capability namespace in `packages/domain/src/capabilities/`.
5. Consume the new capability from your package — **never import `@cat/db` directly**.

**Do not bypass this by adding `@cat/db` to another package's dependencies.**

## Database Schema Modifications & Migration Generation

Any change to the following paths constitutes a **database schema modification**:

- `packages/db/src/drizzle/schema/` — Drizzle ORM table/column definitions
- `packages/shared/src/schema/enum.ts` — Shared enums mapped to PostgreSQL enum types (must be built before migration generation; the Nx dependency graph handles this automatically)

### Rules

1. **Always prefer auto-generated migrations.** After modifying schema or enum files, generate the migration using the Nx target:

   ```bash
   pnpm nx run db:drizzle:generate
   ```

   This command:
   - Automatically builds `@cat/shared` first (via `dependsOn` in `packages/db/project.json`), ensuring enum changes are compiled.
   - Runs `drizzle-kit generate` with the config in `packages/db/drizzle.config.ts`.
   - Outputs a new timestamped migration folder under `packages/db/drizzle/`.

2. **Review the generated SQL** to verify correctness, but do not manually edit it. If the generated migration is wrong, fix the schema source files and re-generate.

3. **Custom migrations (special cases only):** When you need DDL changes that Drizzle Kit cannot auto-generate, or data migrations (e.g. seed data, complex data transformations, manual SQL operations), use `--custom` to generate an empty migration file and write the SQL manually:

   ```bash
   # Inside packages/db
   pnpm drizzle:generate -- --custom --name=<descriptive-name>
   ```

   When using `--custom`, you **must** explain in the PR / commit message why a custom migration is necessary instead of an auto-generated one.

4. **Regenerate Zod schemas after any schema/enum change.** The codegen script derives Zod schemas from the Drizzle schema and writes them to `packages/shared/src/schema/drizzle/`. Run:

   ```bash
   pnpm nx run db:codegen-schemas
   ```

   This target automatically builds `@cat/shared` first (same `dependsOn` as `drizzle:generate`). Always commit the regenerated Zod files together with the schema and migration changes.

5. To apply migrations to the dev database, run:

   ```bash
   pnpm nx run db:drizzle:migrate
   ```
