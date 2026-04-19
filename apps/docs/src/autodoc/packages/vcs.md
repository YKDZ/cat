# @cat/vcs

VCS engine: changeset management, branch merge/rebase, overlay reads, diff strategies

## Overview

* **Modules**: 11

* **Exported functions**: 13

* **Exported types**: 18

## Function Index

### packages/vcs/src

### `detectConflicts`

```ts
/**
 * Detects conflicts: compares main changes since branch creation with branch changes.
 */
export async function detectConflicts(db: DbHandle, branchId: number): Promise<ConflictInfo[]>
```

### `mergeBranch`

```ts
/**
 * Merges a branch into main:
 * 1. Detect conflicts
 * 2. If conflicts exist, mark hasConflicts=true and return
 * 3. If no conflicts, apply branch changes as a new main changeset
 * 4. Update branch status=MERGED
 *
 * @param mergedByUserId - - UUID of the user performing the merge (or null for agent-initiated merges)
 */
export async function mergeBranch(db: DbHandle, branchId: number, mergedByUserId: string | null): Promise<MergeResult>
```

### `rebaseBranch`

```ts
/**
 * Rebase: updates the branch's baseChangesetId to the latest main changeset and rewrites
 * the before-values of UPDATE/DELETE entries to reflect the current main state.
 */
export async function rebaseBranch(db: DbHandle, branchId: number, appMethodRegistry: ApplicationMethodRegistry): Promise<RebaseResult>
```

### `readWithOverlay`

```ts
/**
 * Reads an entity in branch context: checks the most recent branch changeset entry first,
 * then falls back to main data.
 * Returns null if deleted in branch, or if no branch changes exist (caller reads from main).
 */
export async function readWithOverlay(db: DbHandle, branchId: number, entityType: "translation" | "auto_translation" | "element" | "document" | "document_tree" | "comment" | "comment_reaction" | "term" | "term_concept" | "memory_item" | "project_settings" | "project_member" | "project_attributes" | "context" | "project" | "issue", entityId: string): Promise<{ data: T; action: "CREATE" | "UPDATE"; } | { data: null; action: "DELETE"; } | null>
```

### `listWithOverlay`

```ts
/**
 * List query overlay: merges main data with branch changes
 * (CREATE appended, DELETE removed, UPDATE overwritten).
 */
export async function listWithOverlay(db: DbHandle, branchId: number, entityType: "translation" | "auto_translation" | "element" | "document" | "document_tree" | "comment" | "comment_reaction" | "term" | "term_concept" | "memory_item" | "project_settings" | "project_member" | "project_attributes" | "context" | "project" | "issue", mainItems: T[], getItemId: (item: T) => string): Promise<T[]>
```

### `getBranchChangesetId`

```ts
/**
 * Gets the latest changeset ID associated with the given branch.
 */
export async function getBranchChangesetId(db: DbHandle, branchId: number): Promise<number | null>
```

### `getBranchBaseChangesetId`

```ts
/**
 * Gets the baseChangesetId of a branch.
 */
export async function getBranchBaseChangesetId(db: DbHandle, branchId: number): Promise<number | null>
```

### `registerAllDiffStrategies`

```ts
/**
 * Register all 13 entityType diff strategies into the registry
 */
export const registerAllDiffStrategies = (registry: DiffStrategyRegistry)
```

### `getDefaultRegistries`

```ts
export const getDefaultRegistries = (): { diffRegistry: DiffStrategyRegistry; appMethodRegistry: ApplicationMethodRegistry; }
```

### `wireEntityStateFetchers`

```ts
/**
 * Inject EntityStateFetcher into each method in the registry.
 * Called once at server startup so rebase before-rewrite can query actual DB tables.
 */
export function wireEntityStateFetchers(_registry: ApplicationMethodRegistry, _db: DbHandle)
```

### packages/vcs/src/methods

### `createSimpleMethods`

```ts
/**
 * Create SimpleApplicationMethod instances for multiple entityTypes.
 */
export const createSimpleMethods = (entityTypes: string[]): SimpleApplicationMethod[]
```

### packages/vcs/src/strategies

### `shallowDiff`

```ts
/**
 * Shallow field-level diff between two objects, returning changed fields
 */
export const shallowDiff = (before: Record<string, unknown> | null, after: Record<string, unknown> | null): FieldChange[]
```

### `createGenericStrategy`

```ts
/**
 * Generic strategy factory using shallowDiff
 */
export const createGenericStrategy = (options: {
  entityType: string;
  semanticLabel: string;
  impactScope: "LOCAL" | "CASCADING";
  watchedFields?: string[];
}): DiffStrategy<unknown>
```

## Type Index

* `ChangesetEntry` (interface) — Core fields of a changeset entry (mirrors the DB changesetEntry row).

* `AsyncDependencySpec` (interface) — Async dependency spec describing background tasks that must complete when applying a changeset entry.

* `ApplicationResult` (interface) — Result of applying a changeset entry.

* `DependencyStatus` (interface) — Readiness status of an async dependency.

* `ApplicationContext` (interface) — Context for applying a changeset entry.

* `ApplicationMethod` (interface) — Application method interface, separating synchronous CRUD from async-dependent operations.

* `ConflictInfo` (interface)

* `MergeResult` (interface)

* `RebaseResult` (interface)

* `Changeset` (interface) — Changeset summary for internal agent use.

* `CreateChangeSetParams` (interface)

* `AddEntryParams` (interface)

* `ChangeSetFilters` (interface)

* `FieldChange` (interface) — Field-level change description

* `DiffResult` (interface) — Diff computation result

* `DiffStrategy` (interface) — Entity diff strategy interface

* `EntityStateFetcher` (type) — Entity state fetcher callback, provided by the registrar for rebase before-rewrite.

* `VCSContext` (interface) — VCS operation context — determines whether to generate audit records.
