---
name: autodoc-explore
description: Explore the project architecture using auto-generated documentation. Use this skill when you need to understand the overall monorepo structure, find relevant packages, or discover available APIs.
---

# Project Architecture Exploration via Autodoc

Use the auto-generated documentation to understand the CAT monorepo structure.

## Step 1: Read the Overview

Read `apps/docs/src/autodoc/overview.md` for:

- List of all apps and core packages
- Per-package export counts (functions / types)
- Package descriptions
- Dependency relationships between core packages

## Step 2: Dive into Package Details

For each package, read `apps/docs/src/autodoc/packages/<name>.md` for:

- Function signatures in TypeScript code blocks
- Type/interface definitions
- Parameter descriptions (for high-priority packages)

## Step 3: Look Up Specific Symbols

When you need implementation details for a specific symbol, use the `autodoc-lookup` skill:

```bash
pnpm autodoc lookup <symbol-name> [...]
```

## Package Naming Convention

- Core packages: `packages/<name>/` → doc at `packages/<name>.md`
- Short name: strip `@cat/` prefix (e.g., `@cat/domain` → `domain.md`)

## When to Regenerate

If documentation seems stale or a package is missing:

```bash
pnpm nx run autodoc:generate
```
