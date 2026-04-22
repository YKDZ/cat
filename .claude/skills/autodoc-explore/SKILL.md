---
name: autodoc-explore
description: Explore the project architecture using auto-generated documentation. Use this skill when you need to understand the overall monorepo structure, find relevant packages, or discover available APIs.
---

# Project Architecture Exploration via Autodoc

Use the auto-generated documentation to understand the CAT monorepo structure.
AutoDoc organises the output into **sections** (domain / infra / services / ai ...),
each with subject-centric paired pages and a section index.

## Step 1: Read the Overview

Read `apps/docs/src/autodoc/overview.md` for:

- List of all apps and core packages
- Per-package export counts (functions / types)
- Package descriptions
- Dependency relationships between core packages

## Step 2: Navigate by Section

Each Discovery Section has an `index.md` listing its subjects:

- `apps/docs/src/autodoc/domain/index.md` — domain model subjects
- `apps/docs/src/autodoc/infra/index.md` — infrastructure subjects
- `apps/docs/src/autodoc/services/index.md` — service subjects
- `apps/docs/src/autodoc/ai/index.md` — AI system subjects

## Step 3: Read Subject Pages

Each subject has paired bilingual pages:

- `<section>/<subject>.zh.md` — Chinese semantic description + related topics
- `<section>/<subject>.en.md` — API reference table + English labels

Example: `apps/docs/src/autodoc/domain/domain--core.zh.md`

## Step 4: Dive into Package Details

For compat/legacy use, per-package reference docs remain at:

- `apps/docs/src/autodoc/packages/<name>.md`

## Step 5: Look Up Specific Symbols

When you need implementation details for a specific symbol, use the `autodoc-lookup` skill:

```bash
pnpm autodoc lookup <symbol-name> [...]
```

Or browse the agent catalog:

- `apps/docs/src/autodoc/agent/subjects.json` — all subjects (machine-readable)
- `apps/docs/src/autodoc/agent/references.json` — all symbol references (sorted by stableKey)

## Package Naming Convention

- Core packages: `packages/<name>/` → compat doc at `packages/<name>.md`
- Short name: strip `@cat/` prefix (e.g., `@cat/domain` → `domain.md`)

## When to Regenerate

If documentation seems stale or a package is missing:

```bash
pnpm moon run autodoc:generate
```

To validate without writing (shows findings only):

```bash
pnpm moon run autodoc:validate
```
