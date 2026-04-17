import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * @zh document 实体 diff 策略（CASCADING：名称/文件变更影响所有子元素）
 * @en Document entity diff strategy (CASCADING: name/file changes affect all child elements)
 */
export const documentDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "document",
  semanticLabel: "Document",
  impactScope: "CASCADING",
  watchedFields: ["name", "fileHandlerId", "fileId", "languageId"],
});
