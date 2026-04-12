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

  const baseSelection = {
    id: memoryItem.id,
    translationChunkSetId: translationString.chunkSetId,
    memoryId: memoryItem.memoryId,
    creatorId: memoryItem.creatorId,
    createdAt: memoryItem.createdAt,
    updatedAt: memoryItem.updatedAt,
    sourceTemplate: memoryItem.sourceTemplate,
    translationTemplate: memoryItem.translationTemplate,
    slotMapping: memoryItem.slotMapping,
  };

  const [forwardRows, reversedRows] = await Promise.all([
    ctx.db
      .select({
        ...baseSelection,
        source: sourceString.value,
        translation: translationString.value,
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
      .limit(query.maxAmount),
    ctx.db
      .select({
        ...baseSelection,
        source: translationString.value,
        translation: sourceString.value,
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
          eq(translationString.languageId, query.sourceLanguageId),
          eq(sourceString.languageId, query.translationLanguageId),
          eq(translationString.value, trimmedText),
        ),
      )
      .limit(query.maxAmount),
  ]);

  const rows = [
    ...new Map(
      [...forwardRows, ...reversedRows].map((row) => [row.id, row]),
    ).values(),
  ].slice(0, query.maxAmount);

  return rows.map((row) => ({
    ...row,
    confidence: 1,
    adaptationMethod: "exact",
    evidences: [
      {
        channel: "lexical",
        matchedText: row.source,
        matchedVariantText: row.source,
        confidence: 1,
        note: "exact source-string match",
      },
    ],
    matchedText: row.source,
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

  const baseSelection = {
    id: memoryItem.id,
    memoryId: memoryItem.memoryId,
    creatorId: memoryItem.creatorId,
    createdAt: memoryItem.createdAt,
    updatedAt: memoryItem.updatedAt,
    sourceTemplate: memoryItem.sourceTemplate,
    translationTemplate: memoryItem.translationTemplate,
    slotMapping: memoryItem.slotMapping,
  };

  const [forwardRows, reversedRows] = await Promise.all([
    ctx.db
      .select({
        ...baseSelection,
        source: sourceString.value,
        translation: translationString.value,
        translationChunkSetId: translationString.chunkSetId,
        confidence: sql<number>`similarity(${sourceString.value}, ${trimmedText})`,
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
      .limit(query.maxAmount),
    ctx.db
      .select({
        ...baseSelection,
        source: translationString.value,
        translation: sourceString.value,
        translationChunkSetId: sourceString.chunkSetId,
        confidence: sql<number>`similarity(${translationString.value}, ${trimmedText})`,
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
          eq(translationString.languageId, query.sourceLanguageId),
          eq(sourceString.languageId, query.translationLanguageId),
          sql`similarity(${translationString.value}, ${trimmedText}) >= ${query.minSimilarity}`,
        ),
      )
      .orderBy(sql`similarity(${translationString.value}, ${trimmedText}) DESC`)
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
    ...row,
    confidence: row.confidence,
    evidences: [
      {
        channel: "lexical",
        matchedText: row.source,
        matchedVariantText: row.source,
        confidence: row.confidence,
        note: "pg_trgm source-string match",
      },
    ],
    matchedText: row.source,
    sourceTemplate: row.sourceTemplate,
    translationTemplate: row.translationTemplate,
    slotMapping: parseSlotMapping(row.slotMapping),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
};
