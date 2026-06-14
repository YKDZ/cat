import type { DiffStrategyRegistry } from "./diff-strategy-registry.ts";

import {
  commentDiffStrategy,
  commentReactionDiffStrategy,
} from "./strategies/comment.diff.ts";
import {
  contentNodeDiffStrategy,
  contentRelationDiffStrategy,
  contentRelationTypeDiffStrategy,
  contextEvidenceDiffStrategy,
  contextProfileDiffStrategy,
  scopeBindingDiffStrategy,
  semanticDiffEntryDiffStrategy,
} from "./strategies/content-graph.diff.ts";
import { elementDiffStrategy } from "./strategies/element.diff.ts";
import { memoryItemDiffStrategy } from "./strategies/memory-item.diff.ts";
import {
  contextDiffStrategy,
  projectAttributesDiffStrategy,
  projectMemberDiffStrategy,
  projectSettingsDiffStrategy,
} from "./strategies/project.diff.ts";
import {
  termConceptDiffStrategy,
  termDiffStrategy,
} from "./strategies/term.diff.ts";
import { translationDiffStrategy } from "./strategies/translation.diff.ts";

/**
 * Register all entityType diff strategies into the registry (including content graph entities)
 */
export const registerAllDiffStrategies = (
  registry: DiffStrategyRegistry,
): void => {
  registry.register("translation", translationDiffStrategy);
  registry.register("element", elementDiffStrategy);
  registry.register("content_node", contentNodeDiffStrategy);
  registry.register("content_relation", contentRelationDiffStrategy);
  registry.register("content_relation_type", contentRelationTypeDiffStrategy);
  registry.register("context_evidence", contextEvidenceDiffStrategy);
  registry.register("context_profile", contextProfileDiffStrategy);
  registry.register("scope_binding", scopeBindingDiffStrategy);
  registry.register("semantic_diff", semanticDiffEntryDiffStrategy);
  registry.register("comment", commentDiffStrategy);
  registry.register("comment_reaction", commentReactionDiffStrategy);
  registry.register("term", termDiffStrategy);
  registry.register("term_concept", termConceptDiffStrategy);
  registry.register("memory_item", memoryItemDiffStrategy);
  registry.register("project_settings", projectSettingsDiffStrategy);
  registry.register("project_member", projectMemberDiffStrategy);
  registry.register("project_attributes", projectAttributesDiffStrategy);
  registry.register("context", contextDiffStrategy);
};
