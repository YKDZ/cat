# @tools/autodoc - AutoDoc 2.0

Subject-centric documentation compiler for a TypeScript workspace.
Produces Markdown package references, optional `llms.txt`, subject pages, section indexes,
and machine-readable catalog JSON from source code and semantic fragments.

## Quick start

```bash
# Generate all outputs to the configured output directory
pnpm moon run autodoc:generate

# Check that generated outputs are up-to-date (used in CI)
pnpm moon run autodoc:check

# Validate subject manifests and semantic fragments without writing output
pnpm moon run autodoc:validate

# Ad-hoc symbol lookup
node tools/autodoc/dist/cli.js lookup @cat/domain:src/index:MyType
```

## Key concepts

| Concept               | Description                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Subject**           | A named documentation unit that owns one or more packages. Defined in `*.subject.ts` files.       |
| **Section**           | A top-level navigation group. Defined as an inline array or external file in `autodoc.config.ts`. |
| **Semantic fragment** | Human-written prose that annotates a subject (README anchor or `*.semantic.md`).                  |
| **Reference catalog** | Symbol index built from TypeScript source by the reference compiler.                              |
| **Paired page**       | Generated `<subject>.zh.md` + `<subject>.en.md` in the subject's section directory.               |

## Configuration

All workspace-specific settings live in `autodoc.config.ts`. The tool has generic defaults so it can run in any TypeScript workspace without source edits.

```ts
export default defineConfig({
  packages: [{ path: "packages/domain", name: "@acme/domain" }],
  output: { path: "autodoc", format: "markdown" },
  project: {
    name: "Acme",
    summary: "Internal workspace documentation.",
  },
  packageDocs: {
    stripPrefix: "@acme/",
  },
  readmeGlobs: ["packages/*/README.md"],
  overview: {
    title: "Acme Overview",
    sections: [{ type: "packages", heading: "Packages" }],
  },
  llmsTxt: {
    enabled: true,
    projectInfo: ["Tech stack: TypeScript, Hono"],
  },
  catalog: {
    directory: "catalog",
    subjectsFile: "subjects.json",
    referencesFile: "references.json",
    findingsFile: "findings.json",
  },
  validation: {
    semantic: {
      validatePrimaryLanguage: false,
    },
  },
});
```

### `overview.sections` types

| Type         | Fields                                            |
| ------------ | ------------------------------------------------- |
| `"links"`    | `heading`, `items[]{label, description, href?}`   |
| `"packages"` | `heading`, `priorities?: ["high","medium","low"]` |
| `"code"`     | `heading`, `content`, `language?`                 |

### `packageDocs.stripPrefix`

Controls package page filenames. When set (e.g. `"@acme/"`), `@acme/domain` maps to `packages/domain.md`. Without it, `@acme/domain` maps to `packages/acme--domain.md`.

## File layout

```
autodoc.config.ts              # Compilation config (packages, glob patterns, output dir)
packages/*/*.subject.ts        # One manifest per package

<output.path>/
  overview.md                  # Compat: package overview
  llms.txt                     # Compat: LLM-friendly text (when enabled)
  packages/<pkg>.md            # Compat: per-package symbol reference
  <section>/
    index.md                   # Section index (generated)
    <subject>.zh.md            # Bilingual paired page (ZH)
    <subject>.en.md            # Bilingual paired page (EN)
  <catalog.directory>/
    <catalog.subjectsFile>     # Machine-readable catalog: all subjects
    <catalog.referencesFile>   # Machine-readable catalog: all symbol references
    <catalog.findingsFile>     # Validation findings (written by `validate`)
```

## Authoring subjects

Create a `*.subject.ts` file (glob configured via `autodoc.config.ts` `subjects` field):

```ts
import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "domain/my-package", // <section>/<unique-slug>
  title: { zh: "我的包", en: "My Package" },
  section: "domain",
  primaryOwner: "@acme/my-package",
  members: [{ type: "package", ref: "@acme/my-package" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
```

## Authoring semantic fragments

### README anchor style

```markdown
<!-- autodoc:subject=domain/my-package -->

Content goes here.

<!-- autodoc:end -->
```

### Standalone `*.semantic.md`

```yaml
---
subject: domain/my-package
lang: zh
stableKeyRefs:
  - "@acme/my-package:src/index:MyType"
---
Content goes here.
```

## Validation tiers

| Tier       | Description                                                                                |
| ---------- | ------------------------------------------------------------------------------------------ |
| **Tier 1** | Structural — subject manifest parsing, section bindings, duplicate IDs                     |
| **Tier 2** | Reference health — primaryOwner/members packages exist in scanned sources                  |
| **Tier 3** | Publication — generated paired pages and section indexes exist; missing semantic fragments |

Primary-language warnings (`FRAGMENT_ENGLISH_DOMINANT`) are **opt-in** and only emitted when `validation.semantic.validatePrimaryLanguage: true` is set in config.

## CLI reference

```
node dist/cli.js <subcommand> [options]

  generate             Compile and write all outputs to --output (default: autodoc)
  check                Generate to temp dir and diff against committed outputs; exit 1 if stale
  validate             Run all 3 validation tiers; write catalog findings file; exit 1 on errors
  lookup <symbol-id>   Resolve a symbol by ID/stableKey/name and print details
```

## Development

```bash
pnpm moon run autodoc:build          # compile TypeScript → dist/
pnpm moon run autodoc:test           # run unit tests
pnpm moon run autodoc:typecheck      # type-check without emitting
pnpm moon run autodoc:lint           # lint with oxlint
```
