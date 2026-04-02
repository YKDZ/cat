---
description: Guides agents to use autodoc skills for efficient codebase exploration.
paths: ["**/*"]
---

# Codebase Exploration via Autodoc

## When Exploring the Codebase

When you need to understand project structure, find relevant code, or discover APIs:

1. **Load the `autodoc-explore` skill first**: Read `apps/docs/src/autodoc/overview.md` for monorepo structure
2. **Use autodoc package docs**: Read `apps/docs/src/autodoc/packages/<name>.md` for per-package API details
3. **Look up specific symbols**: Run `pnpm autodoc lookup <symbol-name> [...]` for source locations

## When NOT to Use Autodoc

- You already know the exact file path and just need to read it
- You're making targeted changes to a known file
- The question is about the current file context (already in your conversation)

## Using Lookup Results

`pnpm autodoc lookup` returns symbol IDs (e.g., `@cat/domain:src/path:symbolName`), file paths and line ranges. Use these to read the actual implementation:

```bash
pnpm autodoc lookup "createProject"
pnpm autodoc lookup createProject vectorTermAlignOp
```
