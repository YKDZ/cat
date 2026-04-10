---
description: Vitest testing conventions and checklist for introducing or maintaining unit/integration tests.
paths: ["**/*.{spec,test}.ts", "**/vitest.config.ts", "**/tsconfig.spec.json"]
---

# Vitest Testing Rules

This monorepo uses **Vitest 4.x** with a centralised workspace-projects configuration.
You **must** follow these rules when creating or modifying tests.

---

## 1. Architecture Overview

```
vitest.config.ts          ← Root: defines ALL workspace test projects
├─ packages/<name>/       ← Library packages (tsconfig.lib.json)
├─ apps/<name>/           ← Application packages (tsconfig.app.json)
├─ @cat-plugin/<name>/    ← Plugins (may use local vitest.config.ts)
└─ tools/<name>/          ← Tooling packages
```

**Two categories of vitest configuration exist:**

| Category             | Config location                             | Applies to                        |
| -------------------- | ------------------------------------------- | --------------------------------- |
| Centralised projects | Root `vitest.config.ts` → `test.projects[]` | `packages/*`, `apps/*`, `tools/*` |
| Standalone config    | `<plugin>/vitest.config.ts` (local)         | `@cat-plugin/*`                   |

---

## 2. File Naming Convention

| Suffix      | Meaning              | Typical content                                |
| ----------- | -------------------- | ---------------------------------------------- |
| `*.spec.ts` | **Unit test**        | Pure logic, mocked dependencies, no DB/network |
| `*.test.ts` | **Integration test** | Requires DB (`setupTestDB`), real services     |

This convention is enforced by the `--include` flags in `package.json` scripts and by
separate vitest project entries (e.g. `workflow` vs `workflow-integration`).

**Placement**: tests can live in either:

- `src/<feature>/__tests__/<name>.spec.ts` — grouped in `__tests__/` directory
- `src/<feature>/<name>.spec.ts` — co-located with source

Both are acceptable; follow the convention already present in the target package.

---

## 3. Checklist — Adding Tests to a `packages/` or `apps/` Project

### 3.1 Register in Root `vitest.config.ts`

Add a new entry to `test.projects[]`:

```ts
// vitest.config.ts — inside defineConfig({ test: { projects: [ ... ] } })
{
  // Add vue() plugin only for Vue component tests (environment: "happy-dom")
  // plugins: [vue()],
  test: {
    name: "<project-name>",  // e.g. "unit-core", "domain", "workflow-integration"
    include: ["<relative-path>/src/**/*.{spec,test}.ts"],
    environment: "node",     // or "happy-dom" for Vue/browser tests
    // retry: CI ? 3 : 0,    // optional — for flaky integration tests
  },
  resolve: { alias: alias(resolve(ROOT, "<relative-path>")) },
},
```

**Naming rules for `name`:**

- Pure unit-test packages: prefix with `unit-`, e.g. `unit-core`, `unit-graph`
- Packages with mixed unit+integration: use bare name, e.g. `domain`, `operations`
- If unit and integration tests need **separate vitest projects** (different retry/setup),
  create two entries: `<name>` (`.spec.ts` only) and `<name>-integration` (`.test.ts` only)

**Environment rules:**

- `"node"` — default for backend/library packages
- `"happy-dom"` — for Vue component or browser-API tests; also add `plugins: [vue()]`

### 3.2 Add `tsconfig.spec.json`

Create `<project>/tsconfig.spec.json`:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out-tsc/vitest",
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@/*": ["./src/*"],
    },
  },
  "include": [
    "vite.config.ts",
    "vite.config.mts",
    "vitest.config.ts",
    "vitest.config.mts",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.test.tsx",
    "src/**/*.spec.tsx",
    "src/**/*.test.js",
    "src/**/*.spec.js",
    "src/**/*.test.jsx",
    "src/**/*.spec.jsx",
    "src/**/*.d.ts",
  ],
  "references": [
    {
      "path": "./tsconfig.lib.json", // or "./tsconfig.app.json" for apps/plugins
    },
  ],
}
```

> If the package needs vitest global types, add to `compilerOptions.types`:
> `["vitest/globals", "vitest/importMeta", "vite/client", "node", "vitest"]`

### 3.3 Reference `tsconfig.spec.json` in `tsconfig.json`

Ensure the project's `tsconfig.json` includes a reference to the spec config:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.lib.json" }, // or tsconfig.app.json
    { "path": "./tsconfig.spec.json" }, // ← must be present
  ],
}
```

### 3.4 Add Test Scripts to `package.json`

```jsonc
{
  "scripts": {
    // All tests (unit + integration)
    "test": "vitest run --config ../../vitest.config.ts --project=<project-name>",
    // Unit tests only
    "test:unit": "vitest run --config ../../vitest.config.ts --project=<project-name> --include='**/*.spec.ts'",
    // Integration tests only
    "test:integration": "vitest run --config ../../vitest.config.ts --project=<project-name> --include='**/*.test.ts'",
  },
}
```

- `<project-name>` must match the `name` field in `vitest.config.ts → projects[]`.
- If the package only has unit tests, `test:unit` and `test:integration` scripts are optional
  (just keep `test`).
- For the special case where unit and integration have **separate vitest projects**
  (like `workflow` / `workflow-integration`), point `test:unit` and `test:integration` at
  their respective project names.

### 3.5 Add `vitest` to `devDependencies`

```jsonc
{
  "devDependencies": {
    "vitest": "^4.1.3",
    "vite": "^8.0.7",
    // For integration tests:
    // "@cat/test-utils": "workspace:*"
  },
}
```

Run `pnpm install` after editing.

### 3.6 Exclude Test Files from Production Build

In `tsconfig.lib.json` (or `tsconfig.app.json`), ensure test files are excluded:

```jsonc
{
  "exclude": [
    "vite.config.ts",
    "vite.config.mts",
    "vitest.config.ts",
    "vitest.config.mts",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.test.tsx",
    "src/**/*.spec.tsx",
    "src/**/*.test.js",
    "src/**/*.spec.js",
    "src/**/*.test.jsx",
    "src/**/*.spec.jsx",
  ],
}
```

### 3.7 Nx Configuration

Test targets are auto-inferred through `package.json` scripts — no `project.json` changes
are needed. Nx `targetDefaults` in `nx.json` already defines `test`, `test:unit`, and
`test:integration` with correct `dependsOn` (including `^build` and `test-utils` build).

Verify the `namedInputs.production` exclusion pattern already covers your test files:

```
"!{projectRoot}/**/*.+(spec|test).[jt]s?(x)?(.snap)"
```

---

## 4. Checklist — Adding Tests to a `@cat-plugin/` Project

Plugins use a **standalone local `vitest.config.ts`** instead of the root config.

### 4.1 Create Local `vitest.config.ts`

```ts
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    retry: process.env.CI ? 3 : 0,
  },
});
```

### 4.2 Add `tsconfig.spec.json`

Same structure as §3.2 but reference `tsconfig.app.json` (not `tsconfig.lib.json`):

```jsonc
{
  "references": [{ "path": "./tsconfig.app.json" }],
}
```

### 4.3 Reference in `tsconfig.json`

```jsonc
{
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.spec.json" },
  ],
}
```

### 4.4 Package.json Scripts

```jsonc
{
  "scripts": {
    "test": "vitest run",
  },
}
```

Plugins use the local config, so no `--config` or `--project` flags are needed.

---

## 5. Integration Test Utilities (`@cat/test-utils`)

For tests that need a database or plugin infrastructure, use `@cat/test-utils`:

```ts
import { setupTestDB, type TestDB } from "@cat/test-utils";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

let db: TestDB;

beforeAll(async () => {
  db = await setupTestDB();
});

afterAll(async () => {
  await db.cleanup();
});
```

**Key exports:**

- `setupTestDB()` — creates a Drizzle connection to `TEST_DATABASE_URL`, installs pgvector extension, returns `TestDB` (Drizzle instance + `cleanup()`)
- `TestPluginLoader` — loads plugins for test environments
- `TestContext` — typed test context with `user`, `sessionId`, `pluginManager`, `drizzleDB`, `redis`, `cacheStore`, `sessionStore`, `helpers`

The root `vitest.config.ts` automatically derives `TEST_DATABASE_URL` from `DATABASE_URL`
(loaded from `apps/app/.env`). No extra env setup is needed for local development.

---

## 6. Test Environment Matrix

| Package type                                          | Environment | Vue plugin | `@cat/test-utils` |
| ----------------------------------------------------- | ----------- | ---------- | ----------------- |
| Backend library (`packages/core`, `packages/auth`, …) | `node`      | No         | Rarely            |
| Domain / Operations / Workflow                        | `node`      | No         | Integration tests |
| UI components (`packages/ui`)                         | `happy-dom` | Yes        | No                |
| Frontend app (`apps/app`)                             | `happy-dom` | Yes        | No                |
| API app (`apps/app-api`)                              | `node`      | No         | Integration tests |
| Plugins (`@cat-plugin/*`)                             | `node`      | No         | Depends           |
| Tools (`tools/autodoc`)                               | `node`      | No         | No                |

---

## 7. Running Tests

```bash
# Run all tests in the workspace (all projects)
pnpm vitest run

# Run a specific project
pnpm vitest run --project=unit-core

# Run tests for a specific package via Nx
pnpm nx run @cat/core:test

# Run only unit tests for a package
pnpm nx run @cat/domain:test:unit

# Run only integration tests
pnpm nx run @cat/domain:test:integration

# Run affected tests only
pnpm nx affected --target=test
```

---

## 8. Common Pitfalls

1. **Forgot to register in root `vitest.config.ts`** — tests in `packages/` or `apps/` won't
   run via workspace-level `pnpm vitest run` if the project entry is missing.
2. **Wrong project name in `package.json`** — the `--project=` value must exactly match
   the `name` in `vitest.config.ts` projects.
3. **Missing `tsconfig.spec.json` reference** — TypeScript won't resolve test files properly,
   leading to IDE errors.
4. **Test files included in production build** — ensure `tsconfig.lib.json` / `tsconfig.app.json`
   excludes `*.spec.ts` / `*.test.ts`.
5. **Using `.test.ts` for pure unit tests** — may accidentally run against DB in CI or be
   filtered out by `test:unit` scripts. Use `.spec.ts` for unit tests.
6. **Missing `@cat/test-utils` dependency** — integration tests that call `setupTestDB()` need
   `"@cat/test-utils": "workspace:*"` in `devDependencies`.
7. **Plugin tests referencing root config** — `@cat-plugin/*` packages should use their own
   local `vitest.config.ts`, not `--config ../../vitest.config.ts`.
