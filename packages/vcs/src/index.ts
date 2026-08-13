// ── Types ────────────────────────────────────────────────────────────────────
export type {
  ApplicationMethod,
  ApplicationContext,
  ApplicationResult,
  AsyncDependencySpec,
  ChangesetEntry,
  DependencyStatus,
} from "./application-method.ts";

export type { DiffResult, DiffStrategy } from "./diff-strategy.ts";

export type {
  ConflictInfo,
  MergeResult,
  RebaseResult,
} from "./branch-merge.ts";

export type {
  Changeset,
  CreateChangeSetParams,
  AddEntryParams,
  ChangeSetFilters,
} from "./changeset-service.ts";
export {
  ChangeSetApplicationError,
  OCCConflictError,
} from "./changeset-service.ts";

export type { VCSContext } from "./vcs-middleware.ts";
export type {
  EditorOverlayContentNodeRow,
  EditorOverlayContentRelationRow,
  EditorOverlayElementRow,
  EditorOverlayTranslationState,
} from "./editor-overlay-payload.ts";

// ── Classes ──────────────────────────────────────────────────────────────────
export { ApplicationMethodRegistry } from "./application-method-registry.ts";
export { DiffStrategyRegistry } from "./diff-strategy-registry.ts";
export { ChangeSetService } from "./changeset-service.ts";
export { VCSMiddleware } from "./vcs-middleware.ts";
export { SimpleApplicationMethod } from "./methods/simple-application-method.ts";
export type { EntityStateFetcher } from "./methods/simple-application-method.ts";
export { VectorizedStringApplicationMethod } from "./methods/vectorized-string-application-method.ts";
export { MemoryItemApplicationMethod } from "./methods/memory-item-application-method.ts";
export { GlossaryConceptApplicationMethod } from "./methods/glossary-concept-application-method.ts";

// ── Functions ─────────────────────────────────────────────────────────────────
export { detectConflicts, mergeBranch, rebaseBranch } from "./branch-merge.ts";

export {
  readWithOverlay,
  listWithOverlay,
  listOverlayStates,
  getBranchChangesetId,
} from "./branch-overlay.ts";

export {
  EditorOverlayContentNodeRowSchema,
  EditorOverlayContentRelationRowSchema,
  EditorOverlayElementRowSchema,
  EditorOverlayTranslationStateSchema,
} from "./editor-overlay-payload.ts";

export { registerAllDiffStrategies } from "./diff-strategies-init.ts";

export {
  createVCSRouteHelper,
  ensureBranchWriteContext,
} from "./write-context.ts";
export {
  appendBranchChangesWithRetry,
  BranchWriteConflictError,
  BranchWriteInactiveError,
  type BranchChangesetEntry,
} from "./branch-write.ts";

export { wireEntityStateFetchers } from "./wire-entity-state-fetchers.ts";

export { getDefaultRegistries } from "./default-registries.ts";
export { AutoTranslationApplicationMethod } from "./methods/auto-translation-application-method.ts";
