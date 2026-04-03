---
description: Database access rules for plugin development under @cat-plugin/.
paths: ["@cat-plugin/**/*.{ts,vue}"]
---

# Plugin Database Access Rules

## Mandatory: Use PluginCapabilities for Data Access

Plugins under `@cat-plugin/` **must not** depend on `@cat/db` or any database-level API (Drizzle ORM imports, raw SQL, direct `DbHandle`/`DbContext` usage, etc.).

All data access **must** go through the `PluginCapabilities` system provided by `@cat/domain`:

```typescript
// ✅ Correct — use injected capabilities
await this.capabilities.project.get({ id: projectId });
await this.capabilities.translation.updateUnit({ ... });

// ❌ Forbidden — direct database access
import { db } from "@cat/db";
import { projects } from "@cat/db/schema";
db.select().from(projects).where(...);
```

## Why

1. **Permission enforcement** — Capability methods wrap domain queries/commands with `assertPermission()` checks.
2. **Domain events** — Commands return `CommandResult<R>` carrying domain events for audit and side-effects.
3. **Isolation** — Plugins stay decoupled from ORM internals (schema changes, migrations, transactions).
4. **Type safety** — Each capability method is fully typed via `CapabilityInput<T>` / `CapabilityOutput<T>`.

## When No Existing Query/Command Fits

If no existing capability method covers your use case, you are allowed (and encouraged) to implement a **new Query or Command** in `packages/domain/`:

1. Create the query/command file following existing conventions:
   - Queries: `packages/domain/src/queries/<domain>/get-*.query.ts` (or `list-*`, `count-*`)
   - Commands: `packages/domain/src/commands/<domain>/create-*.cmd.ts` (or `update-*`, `delete-*`)
2. Define a Zod schema for the input type.
3. Implement the function with the `Query<Q, R>` or `Command<C, R>` signature (receiving `DbContext`).
4. Wire it into the relevant capability namespace in `packages/domain/src/capabilities/`.
5. Then consume it in your plugin via `PluginCapabilities`.

**Never bypass this by importing database utilities directly into the plugin.**
