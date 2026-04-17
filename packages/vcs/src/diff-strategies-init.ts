import type { DiffStrategyRegistry } from "./diff-strategy-registry.ts";

import {
  commentDiffStrategy,
  commentReactionDiffStrategy,
  documentTreeDiffStrategy,
} from "./strategies/document-tree.diff.ts";
import { documentDiffStrategy } from "./strategies/document.diff.ts";
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
 * @zh 向注册表注册全部 13 种 entityType 的 diff 策略
 * @en Register all 13 entityType diff strategies into the registry
 */
export const registerAllDiffStrategies = (
  registry: DiffStrategyRegistry,
): void => {
  registry.register("translation", translationDiffStrategy);
  registry.register("element", elementDiffStrategy);
  registry.register("document", documentDiffStrategy);
  registry.register("document_tree", documentTreeDiffStrategy);
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
