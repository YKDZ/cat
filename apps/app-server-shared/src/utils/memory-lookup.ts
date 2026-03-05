import type { MemorySuggestion } from "@cat/shared/schema/misc";

/**
 * @module memory-lookup
 *
 * Provides exact-match and trigram-based lexical memory lookup queries.
 *
 * These functions return raw memory items with a confidence score:
 * - Exact match: confidence = 1.0
 * - trgm similarity: confidence = pg_trgm similarity() value
 *
 * Used by {@link streamSearchMemoryOp} as the fast channels
 * (channels 1 & 2) in the three-channel memory recall architecture.
 */
import {
  aliasedTable,
  and,
  eq,
  inArray,
  memoryItem,
  sql,
  translatableString,
  type DrizzleDB,
} from "@cat/db";
import {
  SlotMappingEntrySchema,
  type SlotMappingEntry,
} from "@cat/shared/schema/drizzle/memory";
import * as z from "zod";

/**
 * Parse a jsonb slot-mapping column value safely.
 */
const parseSlotMapping = (raw: unknown): SlotMappingEntry[] | null => {
  const result = z.array(SlotMappingEntrySchema).safeParse(raw);
  return result.success ? result.data : null;
};

/**
 * Internal extended type that carries template columns for post-processing.
 * Stripped to plain {@link MemorySuggestion} before streaming to consumers.
 */
export interface RawMemorySuggestion extends MemorySuggestion {
  sourceTemplate: string | null;
  translationTemplate: string | null;
  slotMapping: SlotMappingEntry[] | null;
}

/**
 * Channel 1: Exact match on source string value.
 * Uses the unique constraint index on `(languageId, value)`.
 * Returns confidence = 1.0 for all results.
 */
export const exactMatchMemory = async (
  drizzle: DrizzleDB["client"],
  input: {
    text: string;
    sourceLanguageId: string;
    translationLanguageId: string;
    memoryIds: string[];
    maxAmount: number;
  },
): Promise<RawMemorySuggestion[]> => {
  if (input.memoryIds.length === 0) return [];

  const sourceString = aliasedTable(translatableString, "sourceString");
  const translationString = aliasedTable(
    translatableString,
    "translationString",
  );

  const rows = await drizzle
    .select({
      id: memoryItem.id,
      source: sourceString.value,
      translation: translationString.value,
      translationChunkSetId: translationString.chunkSetId,
      memoryId: memoryItem.memoryId,
      creatorId: memoryItem.creatorId,
      createdAt: memoryItem.createdAt,
      updatedAt: memoryItem.updatedAt,
      sourceTemplate: memoryItem.sourceTemplate,
      translationTemplate: memoryItem.translationTemplate,
      slotMapping: memoryItem.slotMapping,
    })
    .from(memoryItem)
    .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
    .innerJoin(
      translationString,
      eq(translationString.id, memoryItem.translationStringId),
    )
    .where(
      and(
        inArray(memoryItem.memoryId, input.memoryIds),
        eq(sourceString.languageId, input.sourceLanguageId),
        eq(translationString.languageId, input.translationLanguageId),
        eq(sourceString.value, input.text),
      ),
    )
    .limit(input.maxAmount);

  return rows.map((row) => ({
    ...row,
    similarity: 1.0,
    confidence: 1.0,
    adaptationMethod: "exact" as const,
    sourceTemplate: row.sourceTemplate,
    translationTemplate: row.translationTemplate,
    slotMapping: parseSlotMapping(row.slotMapping),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
};

/**
 * Channel 2: Trigram similarity matching on source string value.
 * Uses the `idx_translatable_string_value_trgm` GIN index.
 * Returns confidence = `similarity()` score.
 */
export const trgmMatchMemory = async (
  drizzle: DrizzleDB["client"],
  input: {
    text: string;
    sourceLanguageId: string;
    translationLanguageId: string;
    memoryIds: string[];
    minSimilarity: number;
    maxAmount: number;
  },
): Promise<RawMemorySuggestion[]> => {
  if (input.memoryIds.length === 0) return [];

  const sourceString = aliasedTable(translatableString, "sourceString");
  const translationString = aliasedTable(
    translatableString,
    "translationString",
  );

  const rows = await drizzle
    .select({
      id: memoryItem.id,
      source: sourceString.value,
      translation: translationString.value,
      translationChunkSetId: translationString.chunkSetId,
      memoryId: memoryItem.memoryId,
      creatorId: memoryItem.creatorId,
      createdAt: memoryItem.createdAt,
      updatedAt: memoryItem.updatedAt,
      confidence: sql<number>`similarity(${sourceString.value}, ${input.text})`,
      sourceTemplate: memoryItem.sourceTemplate,
      translationTemplate: memoryItem.translationTemplate,
      slotMapping: memoryItem.slotMapping,
    })
    .from(memoryItem)
    .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
    .innerJoin(
      translationString,
      eq(translationString.id, memoryItem.translationStringId),
    )
    .where(
      and(
        inArray(memoryItem.memoryId, input.memoryIds),
        eq(sourceString.languageId, input.sourceLanguageId),
        eq(translationString.languageId, input.translationLanguageId),
        sql`similarity(${sourceString.value}, ${input.text}) >= ${input.minSimilarity}`,
      ),
    )
    .orderBy(sql`similarity(${sourceString.value}, ${input.text}) DESC`)
    .limit(input.maxAmount);

  return rows.map((row) => ({
    ...row,
    similarity: row.confidence,
    confidence: row.confidence,
    sourceTemplate: row.sourceTemplate,
    translationTemplate: row.translationTemplate,
    slotMapping: parseSlotMapping(row.slotMapping),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
};
