import {
  aliasedTable,
  eq,
  inArray,
  memoryItem,
  translatableElement,
  translatableString,
  translation,
  type DrizzleTransaction,
} from "@cat/db";

import {
  placeholderize,
  slotsToMapping,
  type SlotMappingEntry,
} from "./memory-template";
import { tokenizeOp } from "./tokenize";

export const insertMemory = async (
  tx: DrizzleTransaction,
  memoryIds: string[],
  translationIds: number[],
): Promise<{ memoryItemIds: number[] }> => {
  if (translationIds.length === 0 || memoryIds.length === 0) {
    return { memoryItemIds: [] };
  }

  const sourceString = aliasedTable(translatableString, "sourceString");
  const translationString = aliasedTable(
    translatableString,
    "translationString",
  );

  const translations = await tx
    .select({
      translationId: translation.id,
      translationStringId: translation.stringId,
      sourceStringId: translatableElement.translatableStringId,
      creatorId: translation.translatorId,
      sourceText: sourceString.value,
      translationText: translationString.value,
    })
    .from(translation)
    .innerJoin(
      translatableElement,
      eq(translation.translatableElementId, translatableElement.id),
    )
    .innerJoin(
      sourceString,
      eq(sourceString.id, translatableElement.translatableStringId),
    )
    .innerJoin(
      translationString,
      eq(translationString.id, translation.stringId),
    )
    .where(inArray(translation.id, translationIds));

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
      const inserted = await tx
        .insert(memoryItem)
        .values(
          templated.map((t) => ({
            translationId: t.translationId,
            translationStringId: t.translationStringId,
            sourceStringId: t.sourceStringId,
            creatorId: t.creatorId,
            sourceTemplate: t.sourceTemplate,
            translationTemplate: t.translationTemplate,
            slotMapping: t.slotMapping,
            memoryId,
          })),
        )
        .returning({ id: memoryItem.id });
      ids.push(...inserted.map((i) => i.id));
    }),
  );

  return { memoryItemIds: ids };
};
