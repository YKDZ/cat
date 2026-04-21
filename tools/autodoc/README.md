# @tools/autodoc — AutoDoc 2.0

Subject-centric documentation compiler for the CAT monorepo.
Produces bilingual (ZH/EN) paired pages, section indexes, compat package references, and agent JSON catalogs from TypeScript sources and semantic fragments.

## Quick start

```bash
# Generate all outputs to apps/docs/src/autodoc/
pnpm moon run autodoc:generate

# Check that generated outputs are up-to-date (used in CI)
pnpm moon run autodoc:check

# Validate subject manifests and semantic fragments without writing output
pnpm moon run autodoc:validate

# Ad-hoc symbol lookup
node tools/autodoc/dist/cli.js lookup @cat/domain:src/index:MyType
```

## Key concepts

| Concept | Description |
|---|---|
| **Subject** | A named documentation unit that owns one or more packages. Defined in `autodoc.subjects/**/*.subject.ts`. |
| **Section** | A top-level navigation group (domain / infrastructure / services / ai). Defined in `sections.config.ts`. |
| **Semantic fragment** | Human-written bilingual prose that annotates a subject (README anchor or `*.semantic.md`). |
| **Reference catalog** | Symbol index built from TypeScript source by the reference compiler. |
| **Paired page** | Generated `<subject>.zh.md` + `<subject>.en.md` in the subject's section directory. |

## File layout

```
autodoc.config.ts              # Compilation config (packages, glob patterns, output dir)
sections.config.ts             # Discovery Section definitions (shared with VitePress)
autodoc.subjects/
  packages/*.subject.ts        # One manifest per package

apps/docs/src/autodoc/
  overview.md                  # Compat: package overview
  llms.txt                     # Compat: LLM-friendly text
  packages/<pkg>.md            # Compat: per-package symbol reference
  <section>/
    index.md                   # Section index (generated)
    <subject>.zh.md            # Bilingual paired page (ZH)
    <subject>.en.md            # Bilingual paired page (EN)
  agent/
    subjects.json              # Agent catalog: all subjects
    references.json            # Agent catalog: all symbol references
    findings.json              # Validation findings (written by `validate`)
```

## Authoring subjects

Create `autodoc.subjects/packages/<name>.subject.ts`:

```ts
import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "domain/my-package",       // <section>/<unique-slug>
  title: { zh: "我的包", en: "My Package" },
  section: "domain",             // must match sections.config.ts
  primaryOwner: "@cat/my-package",
  members: [{ type: "package", ref: "@cat/my-package" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
```

## Authoring semantic fragments

### README anchor style
```markdown
<!-- autodoc:subject=domain/my-package -->
**中文说明。**
<!-- autodoc:end -->
```

### Standalone `*.semantic.md`
```yaml
---
subject: domain/my-package
lang: zh
stableKeyRefs:
  - "@cat/my-package:src/index:MyType"
---

**中文说明。**
```

## Validation tiers

| Tier | Description |
|---|---|
| **Tier 1** | Structural — subject manifest parsing, section bindings, duplicate IDs |
| **Tier 2** | Reference health — primaryOwner/members packages exist in scanned sources |
| **Tier 3** | Publication — generated paired pages and section indexes exist; missing semantic fragments |

## CLI reference

```
node dist/cli.js <subcommand> [options]

  generate             Compile and write all outputs to --output (default: apps/docs/src/autodoc)
  check                Generate to temp dir and diff against committed outputs; exit 1 if stale
  validate             Run all 3 validation tiers; write agent/findings.json; exit 1 on errors
  lookup <symbol-id>   Resolve a symbol by ID/stableKey/name and print details
```

## Development

```bash
pnpm moon run autodoc:build          # compile TypeScript → dist/
pnpm moon run autodoc:test           # run unit tests
pnpm moon run autodoc:typecheck      # type-check without emitting
pnpm moon run autodoc:lint           # lint with oxlint
```
