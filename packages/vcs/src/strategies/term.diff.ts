import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * @zh term 实体 diff 策略
 * @en Term entity diff strategy
 */
export const termDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "term",
  semanticLabel: "Term",
  impactScope: "LOCAL",
  watchedFields: ["term", "status", "type", "language"],
});

/**
 * @zh term_concept 实体 diff 策略（CASCADING：向量化依赖）
 * @en TermConcept entity diff strategy (CASCADING: vectorization dependency)
 */
export const termConceptDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "term_concept",
  semanticLabel: "Term Concept",
  impactScope: "CASCADING",
  watchedFields: ["definition", "termIds", "sourceLanguage"],
});
