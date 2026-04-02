---
description: Auto-generated API documentation usage guide
paths: ["**/*.ts"]
---

# API Documentation Guide

## Progressive Documentation

Documentation uses a two-level structure:

1. **Top-level overview**: `apps/docs/src/autodoc/overview.md` — monorepo structure index with per-package descriptions and export counts
2. **Package details**: `apps/docs/src/autodoc/packages/<name>.md` — function signatures, type definitions, parameter details

## Usage Pattern

1. **Understand the whole**: read `overview.md` for monorepo structure and package responsibilities
2. **Locate a package**: find the relevant package by description
3. **Check signatures**: open the package detail doc for function signatures and types

## Core Packages

- **`@cat/domain`** (`packages/domain.md`): CQRS Commands / Queries
- **`@cat/operations`** (`packages/operations.md`): business workflows, functions suffixed with `Op`

## Bilingual TSDoc

Function and type descriptions are extracted from `@en` (English) block tags when present (per `.claude/rules/tsdoc.md`). For monolingual code without `@en` tags, the raw JSDoc text is used as-is.

## Update Documentation

After modifying core package code:

```bash
pnpm nx run autodoc:generate
```
