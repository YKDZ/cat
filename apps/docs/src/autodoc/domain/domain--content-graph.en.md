# Content Graph Model

> **Section**: Domain  ·  **Subject ID**: `domain/content-graph`

The Content Graph is CAT's structured content organization model. It decouples "translatable text" from "content structure context". Elements continue to serve as the minimal unit of translation; the content graph is responsible for describing containment, dependency, source, and other relationships between elements and content nodes — providing structural signals for translation suggestions, term/memory recall, AI context assembly, and import/export.

## Core Concepts

**ContentNode**: An abstraction for structural boundaries. A node can represent a project root, directory, file, Markdown section, source component, UI route, module, Mod, version, namespace, chapter, or any other meaningful content boundary. Each node records:

- `kind`: Node type, e.g. `PROJECT_ROOT`, `DIRECTORY`, `FILE`, `MARKDOWN_SECTION`, `SOURCE_COMPONENT`, `MODULE`, `MOD`, `NAMESPACE`, etc.
- `stableSourceNodeRef`: A stable source reference that persists across import cycles, used for upsert identity.
- `exportRole`: The role this node plays during export (`NONE` / `DIRECTORY` / `FILE` / `SECTION`).
- `boundaryType`: Context boundary type (`SOURCE_ROOT` / `DIRECTORY` / `FILE` / `MODULE` / `MOD`, etc.).
- `fileHandlerId` / `fileId`: Associated file handler plugin and actual file object (for leaf file nodes).

**ContentRelationType (relation type registry)**: An extensible type registry where each relation type is identified by a `(namespace, name, version)` triple, along with a `semanticFamily` (e.g. `CONTAINMENT`, `DEPENDENCY`, `VERSIONING`, `EVIDENCE`, `SCOPE`), allowed endpoint pairs, directionality, and flags for containment/export participation. The system registers `core:contains:1.0.0` by default; plugins may register custom types.

**ContentRelation (content relation edge)**: A directed or undirected edge connecting two endpoints (`NODE` or `ELEMENT`), recording the relation type, direction, `isPrimary` (whether it is the primary containment edge), `localOrder` (local ordering), `confidenceBasisPoints` (confidence 0–10000), and provenance information.

**StableElementIdentity**: A four-tuple `(importerId, sourceRootRef, sourceNodeRef, stableSourceRef)` provided by importers as a stable anchor for elements across version updates, replacing the fragile metadata deep-comparison identity.

**ContextEvidence**: Evidence records attached to nodes, elements, or relations. The `kind` field describes the evidence type (e.g. screenshot, annotation, external link); used by the context assembler when providing context to models or the editor.

**ScopeBinding**: Associates structural nodes with language assets (glossaries, term concepts, translation memories, memory items, QA rule sets, etc.) to control the scope and precision of term/memory recall.

## Data Flow

### Import Phase

Import plugins parse files and produce a `StructuredContentPayload`:

```
payload = {
  payloadVersion: "content-graph/v1",
  projectId, sourceLanguageId, importerId, sourceRootRef,
  nodes: [StructuredContentNodeInput ...],
  elements: [StructuredTranslatableElementInput ...],
  relations: [StructuredRelationInput ...],
  evidences?: [StructuredEvidenceInput ...],
}
```

`applyStructuredContentGraphEnvelope` persists relation types and content nodes (phase 1); `persistStructuredContentGraphAttachments` persists elements and relation edges (phase 2).

### Diff Phase

`diffStructuredContentOp` (`@cat/operations`) performs a "stable identity diff" at import time:

1. Fetch the existing element snapshot by `(importerId, sourceRootRef, sourceNodeRef)`.
2. Compare new and old elements using `stableSourceRef`, classifying them as `ADDED`, `UPDATED`, `MOVED`, or `REMOVED`.
3. Write `SemanticDiffEntry` records for VCS changeset and PR review consumption.
4. Update vectorized strings (newly added/modified elements trigger `createVectorizedStringOp`).

### Context Assembly

The query layer provides bounded context windows to consumers (editor, memory recall, AI translation) via interfaces such as `getContextEvidence`, `listProjectContentNodes`, and `getContentNodeElements`.

## Commands

| Command | Description |
| ------- | ----------- |
| `applyContentGraphEnvelope` | Persist relation types and content nodes (phase 1 ingestion) |
| `persistContentGraphAttachments` | Persist elements and relation edges (phase 2 ingestion) |
| `createRootContentNode` | Create a root content node for a project |
| `createContentNodeUnderParent` | Create a child content node under a given parent (auto-creates `core:contains` edge) |
| `deleteContentNode` | Delete a content node (cascades to child nodes and relation edges) |
| `ensureCoreRelationTypes` | Idempotently register all built-in relation types |
| `bulkUpdatePrimaryRelationOrder` | Bulk-update `localOrder` on primary containment edges |
| `insertSemanticDiffEntry` | Write a single semantic diff record |

## Queries

| Query | Description |
| ----- | ----------- |
| `getContentNode` | Fetch a single content node by ID |
| `getProjectRootContentNode` | Fetch the project root node |
| `listProjectContentNodes` | List all content nodes under a project (with parent ID and local order) |
| `getContentNodeElements` | Paginated translatable elements under a node (with translation status) |
| `countContentNodeElements` | Count elements under a node matching filter criteria |
| `countContentNodeTranslations` | Count translations under a node for a given language |
| `getContentRelation` | Fetch a relation edge by ID |
| `getContextEvidence` | Fetch a context evidence record |
| `listContentNodeElementIds` | List all element IDs under a node |
| `listContentNodeElementsWithChunkIds` | List elements and their vectorized chunk IDs under a node |
| `getContentNodeFirstElement` | Fetch the first element under a node |
| `getContentNodeElementPageIndex` | Calculate the pagination position of an element |
| `findProjectContentNodeByLabel` | Find a node by display label |
| `getContentNodeBlobInfo` | Fetch blob metadata for the file associated with a node |

## Semantic Families

| Family | Description |
| ------ | ----------- |
| `CONTAINMENT` | Containment relationships forming tree paths |
| `ORDERING` | Local ordering; does not participate in containment but affects rendering |
| `SOURCE_REFERENCE` | References pointing to source files or code locations |
| `SCOPE` | Scope bindings associating language assets |
| `DEPENDENCY` | Dependency relationships between modules or Mods |
| `VERSIONING` | Cross-version inheritance or evolution relationships |
| `EVIDENCE` | Contextual evidence such as screenshots or annotations |
