import type { SlotMappingEntry } from "@cat/shared/schema/drizzle/memory";

import {
  aliasedTable,
  and,
  eq,
  inArray,
  memoryItem,
  memoryRecallVariant,
  sql,
  vectorizedString,
} from "@cat/db";
import { SlotMappingEntrySchema } from "@cat/shared/schema/drizzle/memory";
import * as z from "zod";

import type { RawMemorySuggestion } from "@/queries/memory/list-lexical-memory-suggestions.query";
import type { Query } from "@/types";

export const ListVariantMemorySuggestionsQuerySchema = z.object({
  text: z.string(),
  normalizedText: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  memoryIds: z.array(z.uuidv4()),
  minSimilarity: z.number().min(0).max(1).default(0.7),
  maxAmount: z.int().min(1).default(10),
});

export type ListVariantMemorySuggestionsQuery = z.infer<
  typeof ListVariantMemorySuggestionsQuerySchema
>;

const parseSlotMapping = (raw: unknown): SlotMappingEntry[] | null => {
  const result = z.array(SlotMappingEntrySchema).safeParse(raw);
  return result.success ? result.data : null;
};

const toRecallChannel = (variantType: string) => {
  if (variantType === "TOKEN_TEMPLATE") return "template" as const;
  if (variantType === "FRAGMENT") return "fragment" as const;
  return "morphological" as const;
};

/**
 * Query `MemoryRecallVariant` by trigram similarity on `normalizedText`,
 * then fetch the full memory item details.
 *
 * This covers the morphological recall channel for memory items:
 * - fragment recall (partial surface match)
 * - lemma recall (normalized token join)
 * - template recall (TOKEN_TEMPLATE variant)
 *
 * Results are returned as `RawMemorySuggestion[]` so they are directly
 * compatible with the existing `streamSearchMemoryOp` dedup pipeline.
 */
export const listVariantMemorySuggestions: Query<
  ListVariantMemorySuggestionsQuery,
  RawMemorySuggestion[]
> = async (ctx, query) => {
  if (query.memoryIds.length === 0) return [];

  const normalizedText = query.normalizedText.trim();
  if (normalizedText.length === 0) return [];

  const sourceString = aliasedTable(vectorizedString, "sourceString");
  const translationString = aliasedTable(vectorizedString, "translationString");

  const baseSelection = {
    id: memoryItem.id,
    memoryId: memoryItem.memoryId,
    creatorId: memoryItem.creatorId,
    createdAt: memoryItem.createdAt,
    updatedAt: memoryItem.updatedAt,
    sourceTemplate: memoryItem.sourceTemplate,
    translationTemplate: memoryItem.translationTemplate,
    slotMapping: memoryItem.slotMapping,
    confidence: sql<number>`similarity(${memoryRecallVariant.normalizedText}, ${normalizedText})`,
    matchedVariantText: memoryRecallVariant.text,
    matchedVariantType: memoryRecallVariant.variantType,
  };

  const [forwardRows, reversedRows] = await Promise.all([
    ctx.db
      .select({
        ...baseSelection,
        source: sourceString.value,
        translation: translationString.value,
        translationChunkSetId: translationString.chunkSetId,
      })
      .from(memoryRecallVariant)
      .innerJoin(
        memoryItem,
        eq(memoryItem.id, memoryRecallVariant.memoryItemId),
      )
      .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
      .innerJoin(
        translationString,
        eq(translationString.id, memoryItem.translationStringId),
      )
      .where(
        and(
          inArray(memoryItem.memoryId, query.memoryIds),
          eq(memoryRecallVariant.languageId, query.sourceLanguageId),
          eq(memoryRecallVariant.querySide, "SOURCE"),
          eq(sourceString.languageId, query.sourceLanguageId),
          eq(translationString.languageId, query.translationLanguageId),
          sql`similarity(${memoryRecallVariant.normalizedText}, ${normalizedText}) >= ${query.minSimilarity}`,
        ),
      )
      .orderBy(
        sql`similarity(${memoryRecallVariant.normalizedText}, ${normalizedText}) DESC`,
      )
      .limit(query.maxAmount),
    ctx.db
      .select({
        ...baseSelection,
        source: translationString.value,
        translation: sourceString.value,
        translationChunkSetId: sourceString.chunkSetId,
      })
      .from(memoryRecallVariant)
      .innerJoin(
        memoryItem,
        eq(memoryItem.id, memoryRecallVariant.memoryItemId),
      )
      .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
      .innerJoin(
        translationString,
        eq(translationString.id, memoryItem.translationStringId),
      )
      .where(
        and(
          inArray(memoryItem.memoryId, query.memoryIds),
          eq(memoryRecallVariant.languageId, query.sourceLanguageId),
          eq(memoryRecallVariant.querySide, "TRANSLATION"),
          eq(translationString.languageId, query.sourceLanguageId),
          eq(sourceString.languageId, query.translationLanguageId),
          sql`similarity(${memoryRecallVariant.normalizedText}, ${normalizedText}) >= ${query.minSimilarity}`,
        ),
      )
      .orderBy(
        sql`similarity(${memoryRecallVariant.normalizedText}, ${normalizedText}) DESC`,
      )
      .limit(query.maxAmount),
  ]);

  const rows = [
    ...new Map(
      [...forwardRows, ...reversedRows]
        .sort((a, b) => b.confidence - a.confidence)
        .map((row) => [row.id, row]),
    ).values(),
  ].slice(0, query.maxAmount);

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    translation: row.translation,
    translationChunkSetId: row.translationChunkSetId,
    memoryId: row.memoryId,
    creatorId: row.creatorId,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    confidence: row.confidence,
    evidences: [
      {
        channel: toRecallChannel(row.matchedVariantType),
        matchedText: row.source,
        matchedVariantText: row.matchedVariantText,
        matchedVariantType: row.matchedVariantType,
        confidence: row.confidence,
        note: "recall variant similarity match",
      },
    ],
    matchedText: row.source,
    sourceTemplate: row.sourceTemplate,
    translationTemplate: row.translationTemplate,
    slotMapping: parseSlotMapping(row.slotMapping),
    matchedVariantText: row.matchedVariantText,
    matchedVariantType: row.matchedVariantType,
  }));
};
