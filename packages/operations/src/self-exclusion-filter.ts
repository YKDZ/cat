import { serverLogger as logger } from "@cat/server-shared";

/**
 * @zh 从记忆匹配结果中移除当前元素的自身记忆条目。
 * @en Remove the current element's own memory items from recall results.
 *
 * @param candidates - {@zh 精排后的候选或建议列表} {@en Ranked candidates or suggestion list}
 * @param excludeMemoryItemIds - {@zh 要排除的 memoryItem UUID 列表} {@en Memory item UUIDs to exclude}
 * @returns - {@zh 排除自匹配后的结果} {@en Results with self-matches excluded}
 */
export const applySelfExclusion = <T extends { memoryId: string }>(
  candidates: T[],
  excludeMemoryItemIds?: string[],
): T[] => {
  if (!excludeMemoryItemIds || excludeMemoryItemIds.length === 0) {
    return candidates;
  }

  const excludeSet = new Set(excludeMemoryItemIds);
  const originalCount = candidates.length;
  const filtered = candidates.filter((c) => !excludeSet.has(c.memoryId));

  if (filtered.length < originalCount) {
    logger
      .withSituation("OP")
      .info(
        `SELF_EX: excluded ${originalCount - filtered.length} self-matches (excluded IDs: ${[...excludeSet].join(", ")})`,
      );
  }

  return filtered;
};
