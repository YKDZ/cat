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

/**
 * @zh 将翻译写入指定的翻译记忆库。
 *
 * 对每条翻译，使用分词器和占位符化算法生成模板（含占位符时才存储）。
 * 分词失败为非致命错误，将在无模板的情况下继续写入。
 * @en Write translations into the specified translation memory banks.
 *
 * For each translation, generates source and translation templates via
 * tokenization and placeholderization (templates are only stored when
 * placeholders are present). Tokenization failures are non-fatal;
 * the memory item will be inserted without a template.
 *
 * @param tx - {@zh 数据库事务句柄} {@en Database transaction handle}
 * @param memoryIds - {@zh 目标记忆库 UUID 列表} {@en List of target memory bank UUIDs}
 * @param translationIds - {@zh 要写入的翻译 ID 列表} {@en List of translation IDs to store}
 * @returns - {@zh 写入的记忆条目 ID 列表} {@en List of created memory item IDs}
 */
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
