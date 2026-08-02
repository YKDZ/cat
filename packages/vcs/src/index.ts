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

export { wireEntityStateFetchers } from "./wire-entity-state-fetchers.ts";

// ── Default Registries ────────────────────────────────────────────────────────
import { ApplicationMethodRegistry } from "./application-method-registry.ts";
import { registerAllDiffStrategies } from "./diff-strategies-init.ts";
import { DiffStrategyRegistry } from "./diff-strategy-registry.ts";
import { AutoTranslationApplicationMethod } from "./methods/auto-translation-application-method.ts";
import { GlossaryConceptApplicationMethod } from "./methods/glossary-concept-application-method.ts";
import { MemoryItemApplicationMethod } from "./methods/memory-item-application-method.ts";
import { SimpleApplicationMethod } from "./methods/simple-application-method.ts";
import { VectorizedStringApplicationMethod } from "./methods/vectorized-string-application-method.ts";

/**
 * Translation and Element use VectorizedStringApplicationMethod; Glossary
 * concepts and Memory Items use their canonical domain application methods.
 * Create and return registries pre-populated with all default strategies
 * and application methods.
 * Other entities use SimpleApplicationMethod.
 */
let _cachedRegistries: {
  diffRegistry: DiffStrategyRegistry;
  appMethodRegistry: ApplicationMethodRegistry;
} | null = null;

export const getDefaultRegistries = (): {
  diffRegistry: DiffStrategyRegistry;
  appMethodRegistry: ApplicationMethodRegistry;
} => {
  if (_cachedRegistries) return _cachedRegistries;

  const diffRegistry = new DiffStrategyRegistry();
  registerAllDiffStrategies(diffRegistry);

  const appMethodRegistry = new ApplicationMethodRegistry();

  // Entities requiring async vectorization
  for (const entityType of ["translation", "element"]) {
    appMethodRegistry.register(
      entityType,
      new VectorizedStringApplicationMethod(entityType),
    );
  }
  appMethodRegistry.register(
    "term_concept",
    new GlossaryConceptApplicationMethod(),
  );
  appMethodRegistry.register("memory_item", new MemoryItemApplicationMethod());

  // Entities with simple CRUD (no async deps)
  for (const entityType of [
    "content_node",
    "content_relation",
    "content_relation_type",
    "context_evidence",
    "context_profile",
    "scope_binding",
    "semantic_diff",
    "comment",
    "comment_reaction",
    "project_settings",
    "project_member",
    "project_attributes",
    "context",
    "project",
    "issue",
  ]) {
    appMethodRegistry.register(
      entityType,
      new SimpleApplicationMethod(entityType),
    );
  }

  // Auto-translate pre-translation entries — creates real Translation records on PR merge
  appMethodRegistry.register(
    "auto_translation",
    new AutoTranslationApplicationMethod(),
  );

  _cachedRegistries = { diffRegistry, appMethodRegistry };
  return _cachedRegistries;
};

export { AutoTranslationApplicationMethod } from "./methods/auto-translation-application-method.ts";
