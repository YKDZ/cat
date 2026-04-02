---
name: autodoc-explore
description: Explore the CAT project architecture using auto-generated documentation. Use this skill when you need to understand the overall monorepo structure, find relevant packages, or discover available APIs.
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
pnpm autodoc lookup <symbol-name>
```

## Package Naming Convention

- Core packages: `packages/<name>/` → doc at `packages/<name>.md`
- Short name: strip `@cat/` prefix (e.g., `@cat/domain` → `domain.md`)

## Plugin Service Types

The plugin system (`@cat/plugin-core`) supports these service types:

- **AUTH_PROVIDER**: Authentication (password, OIDC)
- **MFA_PROVIDER**: Multi-factor auth (TOTP)
- **STORAGE_PROVIDER**: File storage (local, S3)
- **FILE_IMPORTER/EXPORTER**: File format handlers (JSON, Markdown, YAML)
- **TERM_EXTRACTOR**: Terminology extraction
- **TERM_ALIGNER**: Terminology alignment
- **QA_CHECKER**: Quality assurance checks
- **TOKENIZER**: Text tokenization
- **NLP_WORD_SEGMENTER**: Word segmentation (spaCy)
- **TRANSLATION_ADVISOR**: Translation suggestions (LibreTranslate)
- **TEXT_VECTORIZER**: Text embedding
- **VECTOR_STORAGE**: Vector storage (pgvector)
- **LLM_PROVIDER**: LLM integration (OpenAI-compatible)
- **AGENT_TOOL_PROVIDER**: Agent tool extensions
- **AGENT_CONTEXT_PROVIDER**: Agent context extensions

Plugin implementations live in `packages/@cat-plugin/` with manifest-based discovery.

## When to Regenerate

If documentation seems stale or a package is missing:

```bash
pnpm nx run autodoc:generate
```
