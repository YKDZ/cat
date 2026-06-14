import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * Element entity diff strategy (CASCADING: translatableStringId change cascades)
 */
export const elementDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "element",
  semanticLabel: "Element",
  impactScope: "CASCADING",
  watchedFields: ["translatableStringId", "content", "name", "type"],
});
