# Version Control Integration

> **Section**: Infra  ·  **Subject ID**: `infra/vcs`

**Primary package**: `@cat/vcs`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `ChangesetEntry` | interface | Core fields of a changeset entry (mirrors the DB changesetEntry row). |
| `AsyncDependencySpec` | interface | Async dependency spec describing background tasks that must complete when applyi |
| `ApplicationResult` | interface | Result of applying a changeset entry. |
| `DependencyStatus` | interface | Readiness status of an async dependency. |
| `ApplicationContext` | interface | Context for applying a changeset entry. |
| `ApplicationMethod` | interface | Application method interface, separating synchronous CRUD from async-dependent o |
| `detectConflicts` | function | Detects conflicts: compares main changes since branch creation with branch chang |
| `mergeBranch` | function | Merges a branch into main:
1. Detect conflicts
2. If conflicts exist, mark hasCo |
| `rebaseBranch` | function | Rebase: updates the branch's baseChangesetId to the latest main changeset and re |
| `ConflictInfo` | interface |  |
| `MergeResult` | interface |  |
| `RebaseResult` | interface |  |
| `readWithOverlay` | function | Reads an entity in branch context: checks the most recent branch changeset entry |
| `listWithOverlay` | function | List query overlay: merges main data with branch changes
(CREATE appended, DELET |
| `getBranchChangesetId` | function | Gets the latest changeset ID associated with the given branch. |
| `getBranchBaseChangesetId` | function | Gets the baseChangesetId of a branch. |
| `Changeset` | interface | Changeset summary for internal agent use. |
| `CreateChangeSetParams` | interface |  |
| `AddEntryParams` | interface |  |
| `ChangeSetFilters` | interface |  |
| `registerAllDiffStrategies` | function | Register all 13 entityType diff strategies into the registry |
| `FieldChange` | interface | Field-level change description |
| `DiffResult` | interface | Diff computation result |
| `DiffStrategy` | interface | Entity diff strategy interface |
| `getDefaultRegistries` | function |  |
| `createSimpleMethods` | function | Create SimpleApplicationMethod instances for multiple entityTypes. |
| `EntityStateFetcher` | type | Entity state fetcher callback, provided by the registrar for rebase before-rewri |
| `shallowDiff` | function | Shallow field-level diff between two objects, returning changed fields |
| `createGenericStrategy` | function | Generic strategy factory using shallowDiff |
| `VCSContext` | interface | VCS operation context — determines whether to generate audit records. |
| `wireEntityStateFetchers` | function | Inject EntityStateFetcher into each method in the registry.
Called once at serve |
