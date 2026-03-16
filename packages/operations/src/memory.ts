import type { DbHandle } from "@cat/domain";

import {
  createMemoryItems,
  executeCommand,
  executeQuery,
  fetchTranslationsForMemory,
} from "@cat/domain";

import {
  placeholderize,
  slotsToMapping,
  type SlotMappingEntry,
} from "./memory-template";
import { tokenizeOp } from "./tokenize";

export const insertMemory = async (
  tx: DbHandle,
  memoryIds: string[],
  translationIds: number[],
): Promise<{ memoryItemIds: number[] }> => {
  if (translationIds.length === 0 || memoryIds.length === 0) {
    return { memoryItemIds: [] };
  }

  const translations = await executeQuery(
    { db: tx },
    fetchTranslationsForMemory,
    { translationIds },
  );

  // Compute templates for each translation pair
  const templated = await Promise.all(
    translations.map(async (t) => {
      let sourceTemplate: string | null = null;
      let translationTemplate: string | null = null;
      let slotMapping: SlotMappingEntry[] | null = null;

      try {
        const [srcTokens, tgtTokens] = await Promise.all([
          tokenizeOp({ text: t.sourceText }),
          tokenizeOp({ text: t.translationText }),
        ]);

        const srcResult = placeholderize(srcTokens.tokens, t.sourceText);
        const tgtResult = placeholderize(tgtTokens.tokens, t.translationText);

        // Only store templates when there are actual placeholders
        if (srcResult.slots.length > 0 || tgtResult.slots.length > 0) {
          sourceTemplate = srcResult.template;
          translationTemplate = tgtResult.template;
          slotMapping = [
            ...slotsToMapping(srcResult.slots).map((s) => ({
              ...s,
              placeholder: `src:${s.placeholder}`,
            })),
            ...slotsToMapping(tgtResult.slots).map((s) => ({
              ...s,
              placeholder: `tgt:${s.placeholder}`,
            })),
          ];
        }
      } catch {
        // Tokenization failure is non-fatal — proceed without templates
      }

      return { ...t, sourceTemplate, translationTemplate, slotMapping };
    }),
  );

  const ids: number[] = [];

  await Promise.all(
    memoryIds.map(async (memoryId) => {
      const result = await executeCommand({ db: tx }, createMemoryItems, {
        memoryId,
        items: templated.map((t) => ({
          translationId: t.translationId,
          translationStringId: t.translationStringId,
          sourceStringId: t.sourceStringId,
          creatorId: t.creatorId,
          sourceTemplate: t.sourceTemplate,
          translationTemplate: t.translationTemplate,
          slotMapping: t.slotMapping,
        })),
      });
      ids.push(...result);
    }),
  );

  return { memoryItemIds: ids };
};
