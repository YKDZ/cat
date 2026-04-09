import type { MemorySuggestion } from "@cat/shared/schema/misc";

import {
  aliasedTable,
  and,
  eq,
  inArray,
  memoryItem,
  sql,
  vectorizedString,
} from "@cat/db";
import {
  SlotMappingEntrySchema,
  type SlotMappingEntry,
} from "@cat/shared/schema/drizzle/memory";
import * as z from "zod/v4";

import type { Query } from "@/types";

export type RawMemorySuggestion = MemorySuggestion & {
  sourceTemplate: string | null;
  translationTemplate: string | null;
  slotMapping: SlotMappingEntry[] | null;
};

const parseSlotMapping = (raw: unknown): SlotMappingEntry[] | null => {
  const result = z.array(SlotMappingEntrySchema).safeParse(raw);
  return result.success ? result.data : null;
};

export const ListExactMemorySuggestionsQuerySchema = z.object({
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  memoryIds: z.array(z.uuidv4()),
  maxAmount: z.int().min(1),
});

export type ListExactMemorySuggestionsQuery = z.infer<
  typeof ListExactMemorySuggestionsQuerySchema
>;

export const listExactMemorySuggestions: Query<
  ListExactMemorySuggestionsQuery,
  RawMemorySuggestion[]
> = async (ctx, query) => {
  if (query.memoryIds.length === 0) return [];

  const trimmedText = query.text.trim();
  if (trimmedText.length === 0) return [];

  const sourceString = aliasedTable(vectorizedString, "sourceString");
  const translationString = aliasedTable(vectorizedString, "translationString");

  const rows = await ctx.db
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
        inArray(memoryItem.memoryId, query.memoryIds),
        eq(sourceString.languageId, query.sourceLanguageId),
        eq(translationString.languageId, query.translationLanguageId),
        eq(sourceString.value, trimmedText),
      ),
    )
    .limit(query.maxAmount);

  return rows.map((row) => ({
    ...row,
    confidence: 1,
    adaptationMethod: "exact",
    sourceTemplate: row.sourceTemplate,
    translationTemplate: row.translationTemplate,
    slotMapping: parseSlotMapping(row.slotMapping),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
};

export const ListTrgmMemorySuggestionsQuerySchema = z.object({
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  memoryIds: z.array(z.uuidv4()),
  minSimilarity: z.number().min(0).max(1),
  maxAmount: z.int().min(1),
});

export type ListTrgmMemorySuggestionsQuery = z.infer<
  typeof ListTrgmMemorySuggestionsQuerySchema
>;

export const listTrgmMemorySuggestions: Query<
  ListTrgmMemorySuggestionsQuery,
  RawMemorySuggestion[]
> = async (ctx, query) => {
  if (query.memoryIds.length === 0) return [];

  const trimmedText = query.text.trim();
  if (trimmedText.length === 0) return [];

  const sourceString = aliasedTable(vectorizedString, "sourceString");
  const translationString = aliasedTable(vectorizedString, "translationString");

  const rows = await ctx.db
    .select({
      id: memoryItem.id,
      source: sourceString.value,
      translation: translationString.value,
      translationChunkSetId: translationString.chunkSetId,
      memoryId: memoryItem.memoryId,
      creatorId: memoryItem.creatorId,
      createdAt: memoryItem.createdAt,
      updatedAt: memoryItem.updatedAt,
      confidence: sql<number>`similarity(${sourceString.value}, ${trimmedText})`,
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
        inArray(memoryItem.memoryId, query.memoryIds),
        eq(sourceString.languageId, query.sourceLanguageId),
        eq(translationString.languageId, query.translationLanguageId),
        sql`similarity(${sourceString.value}, ${trimmedText}) >= ${query.minSimilarity}`,
      ),
    )
    .orderBy(sql`similarity(${sourceString.value}, ${trimmedText}) DESC`)
    .limit(query.maxAmount);

  return rows.map((row) => ({
    ...row,
    confidence: row.confidence,
    sourceTemplate: row.sourceTemplate,
    translationTemplate: row.translationTemplate,
    slotMapping: parseSlotMapping(row.slotMapping),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
};
