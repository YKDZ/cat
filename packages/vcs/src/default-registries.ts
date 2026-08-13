import { ApplicationMethodRegistry } from "./application-method-registry.ts";
import { registerAllDiffStrategies } from "./diff-strategies-init.ts";
import { DiffStrategyRegistry } from "./diff-strategy-registry.ts";
import { AutoTranslationApplicationMethod } from "./methods/auto-translation-application-method.ts";
import { GlossaryConceptApplicationMethod } from "./methods/glossary-concept-application-method.ts";
import { MemoryItemApplicationMethod } from "./methods/memory-item-application-method.ts";
import { SimpleApplicationMethod } from "./methods/simple-application-method.ts";
import { VectorizedStringApplicationMethod } from "./methods/vectorized-string-application-method.ts";

let cachedRegistries: {
  diffRegistry: DiffStrategyRegistry;
  appMethodRegistry: ApplicationMethodRegistry;
} | null = null;

/** Creates registries pre-populated with every default VCS strategy and method. */
export const getDefaultRegistries = (): {
  diffRegistry: DiffStrategyRegistry;
  appMethodRegistry: ApplicationMethodRegistry;
} => {
  if (cachedRegistries) return cachedRegistries;

  const diffRegistry = new DiffStrategyRegistry();
  registerAllDiffStrategies(diffRegistry);
  const appMethodRegistry = new ApplicationMethodRegistry();
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
  appMethodRegistry.register(
    "auto_translation",
    new AutoTranslationApplicationMethod(),
  );
  cachedRegistries = { diffRegistry, appMethodRegistry };
  return cachedRegistries;
};
