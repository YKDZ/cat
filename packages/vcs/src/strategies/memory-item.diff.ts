import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

/**
 * MemoryItem entity diff strategy (CASCADING: vectorization dependency)
 */
export const memoryItemDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "memory_item",
  semanticLabel: "Memory Item",
  impactScope: "CASCADING",
  watchedFields: ["content", "type", "tags", "slotMapping"],
});
