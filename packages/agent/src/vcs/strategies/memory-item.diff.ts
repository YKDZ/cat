import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * @zh memory_item 实体 diff 策略（CASCADING：向量化依赖）
 * @en MemoryItem entity diff strategy (CASCADING: vectorization dependency)
 */
export const memoryItemDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "memory_item",
  semanticLabel: "Memory Item",
  impactScope: "CASCADING",
  watchedFields: ["content", "type", "tags", "slotMapping"],
});
