import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * @zh element 实体 diff 策略（CASCADING：translatableStringId 变更影响关联翻译）
 * @en Element entity diff strategy (CASCADING: translatableStringId change cascades)
 */
export const elementDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "element",
  semanticLabel: "Element",
  impactScope: "CASCADING",
  watchedFields: ["translatableStringId", "content", "name", "type"],
});
