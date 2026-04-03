---
description: Constraints for the @cat/shared package — isomorphic-only, no server APIs, and auto-generated code zones.
paths: ["packages/shared/**/*.{ts,vue,js}"]
---

# @cat/shared Package Rules

## 1. Isomorphic Only — No Server-Side Imports

`@cat/shared` is consumed by **both browser and server** code. It **must not** import any environment-specific module:

- **Forbidden**: `node:*` built-in modules (`node:fs`, `node:path`, `node:crypto`, …)
- **Forbidden**: Any npm package that only works in Node.js (e.g., `fs-extra`, `better-sqlite3`)
- **Forbidden**: Direct usage of browser-only globals (`document`, `window`) without a guard — prefer isomorphic alternatives

```typescript
// ❌ Breaks in browser
import { readFileSync } from "node:fs";

// ❌ Node-only package
import pg from "pg";

// ✅ Isomorphic
import { z } from "zod";
```

If a utility genuinely requires Node.js APIs, it belongs in a server-side package (e.g., `@cat/server-shared`) rather than `@cat/shared`.

## 2. Auto-Generated Code — Do Not Edit

The directory **`packages/shared/src/schema/drizzle/`** is **entirely auto-generated** by:

```bash
pnpm nx codegen:schemas db
```

**Rules:**

- **Never** manually edit any file under `src/schema/drizzle/`.
- **Never** create new files in that directory by hand.
- If the generated output needs to change, modify the source schema in the `packages/db` package and re-run the codegen command.
- When reviewing or searching code, treat these files as **read-only reference** — do not suggest modifications to them.
