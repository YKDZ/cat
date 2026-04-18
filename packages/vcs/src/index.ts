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
export { OCCConflictError } from "./changeset-service.ts";

export type { VCSContext } from "./vcs-middleware.ts";

// ── Classes ──────────────────────────────────────────────────────────────────
export { ApplicationMethodRegistry } from "./application-method-registry.ts";
export { DiffStrategyRegistry } from "./diff-strategy-registry.ts";
export { ChangeSetService } from "./changeset-service.ts";
export { VCSMiddleware } from "./vcs-middleware.ts";
export { SimpleApplicationMethod } from "./methods/simple-application-method.ts";
export type { EntityStateFetcher } from "./methods/simple-application-method.ts";
export { VectorizedStringApplicationMethod } from "./methods/vectorized-string-application-method.ts";

// ── Functions ─────────────────────────────────────────────────────────────────
export { detectConflicts, mergeBranch, rebaseBranch } from "./branch-merge.ts";

export {
  readWithOverlay,
  listWithOverlay,
  getBranchChangesetId,
} from "./branch-overlay.ts";

export { registerAllDiffStrategies } from "./diff-strategies-init.ts";

export { wireEntityStateFetchers } from "./wire-entity-state-fetchers.ts";

// ── Default Registries ────────────────────────────────────────────────────────
import { ApplicationMethodRegistry } from "./application-method-registry.ts";
import { registerAllDiffStrategies } from "./diff-strategies-init.ts";
import { DiffStrategyRegistry } from "./diff-strategy-registry.ts";
import { AutoTranslationApplicationMethod } from "./methods/auto-translation-application-method.ts";
import { SimpleApplicationMethod } from "./methods/simple-application-method.ts";
import { VectorizedStringApplicationMethod } from "./methods/vectorized-string-application-method.ts";

/**
 * @zh 创建并返回预注册所有默认策略和应用方法的注册表。
 * 向量化实体（translation、element、term_concept、memory_item）使用
 * VectorizedStringApplicationMethod；其余实体使用 SimpleApplicationMethod。
 * @en Create and return registries pre-populated with all default strategies
 * and application methods.
 * Vectorized entities (translation, element, term_concept, memory_item) use
 * VectorizedStringApplicationMethod; others use SimpleApplicationMethod.
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
  for (const entityType of [
    "translation",
    "element",
    "term_concept",
    "memory_item",
  ]) {
    appMethodRegistry.register(
      entityType,
      new VectorizedStringApplicationMethod(entityType),
    );
  }

  // Entities with simple CRUD (no async deps)
  for (const entityType of [
    "document",
    "document_tree",
    "comment",
    "comment_reaction",
    "term",
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
