import type { DbHandle } from "@cat/domain";
import {
  createMemoryItems,
  executeCommand,
  executeQuery,
  fetchTranslationsForMemory,
} from "@cat/domain";
import type { RecallDerivationReference } from "@cat/shared";

/**
 * Write translations into the specified translation memory banks.
 *
 * The canonical transaction only persists Memory Items and durable recall
 * derivation demand. Language Analysis and variant derivation run after commit.
 *
 * @param tx - Database transaction handle
 * @param memoryIds - List of target memory bank UUIDs
 * @param translationIds - List of translation IDs to store
 * @returns - List of created memory item IDs
 */
export const insertMemory = async (
  tx: DbHandle,
  memoryIds: string[],
  translationIds: number[],
): Promise<{
  memoryItemIds: number[];
  itemsByMemoryId: Array<{ memoryId: string; memoryItemId: number }>;
  derivations: RecallDerivationReference[];
}> => {
  if (translationIds.length === 0 || memoryIds.length === 0) {
    return { memoryItemIds: [], itemsByMemoryId: [], derivations: [] };
  }

  const translations = await executeQuery(
    { db: tx },
    fetchTranslationsForMemory,
    { translationIds },
  );

  const ids: number[] = [];
  const itemsByMemoryId: Array<{ memoryId: string; memoryItemId: number }> = [];
  const derivations: RecallDerivationReference[] = [];

  for (const memoryId of [...new Set(memoryIds)].sort()) {
    const result = await executeCommand({ db: tx }, createMemoryItems, {
      memoryId,
      items: translations.map((translation) => ({
        translationId: translation.translationId,
        translationStringId: translation.translationStringId,
        sourceStringId: translation.sourceStringId,
        creatorId: translation.creatorId,
      })),
    });
    ids.push(...result.items.map((item) => item.id));
    itemsByMemoryId.push(
      ...result.items.map((item) => ({
        memoryId,
        memoryItemId: item.id,
      })),
    );
    derivations.push(...result.derivations);
  }

  return { memoryItemIds: ids, itemsByMemoryId, derivations };
};
