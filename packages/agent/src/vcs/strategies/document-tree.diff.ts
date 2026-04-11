import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * @zh document_tree 实体 diff 策略（CASCADING：闭包表批量变更）
 * @en DocumentTree entity diff strategy (CASCADING: closure table batch changes)
 */
export const documentTreeDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "document_tree",
  semanticLabel: "Document Tree",
  impactScope: "CASCADING",
});

/**
 * @zh comment 实体 diff 策略
 * @en Comment entity diff strategy
 */
export const commentDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "comment",
  semanticLabel: "Comment",
  impactScope: "LOCAL",
  watchedFields: ["content", "status", "resolvedAt"],
});

/**
 * @zh comment_reaction 实体 diff 策略
 * @en CommentReaction entity diff strategy
 */
export const commentReactionDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "comment_reaction",
  semanticLabel: "Comment Reaction",
  impactScope: "LOCAL",
  watchedFields: ["type"],
});
