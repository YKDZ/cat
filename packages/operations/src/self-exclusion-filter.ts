import { serverLogger as logger } from "@cat/server-shared";

/**
 * Remove the current element's own memory items from recall results.
 *
 * @param candidates - Ranked candidates or suggestion list
 * @param excludeMemoryItemIds - Memory item UUIDs to exclude
 * @returns - Results with self-matches excluded
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
