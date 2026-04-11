import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * @zh translation 实体 diff 策略（LOCAL 影响范围）
 * @en Translation entity diff strategy (LOCAL impact scope)
 */
export const translationDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "translation",
  semanticLabel: "Translation",
  impactScope: "LOCAL",
  watchedFields: ["content", "status", "stringId", "languageId"],
});
