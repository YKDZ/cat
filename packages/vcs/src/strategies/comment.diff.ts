import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * Comment entity diff strategy
 */
export const commentDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "comment",
  semanticLabel: "Comment",
  impactScope: "LOCAL",
  watchedFields: ["content", "status", "resolvedAt"],
});

/**
 * CommentReaction entity diff strategy
 */
export const commentReactionDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "comment_reaction",
  semanticLabel: "Comment Reaction",
  impactScope: "LOCAL",
  watchedFields: ["type"],
});
