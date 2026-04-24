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
import * as z from "zod";

import type { RawMemorySuggestion } from "@/queries/memory/list-lexical-memory-suggestions.query";
import type { Query } from "@/types";

export const ListBm25MemorySuggestionsQuerySchema = z.object({
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  memoryIds: z.array(z.uuidv4()),
  maxAmount: z.int().min(1),
});

export type ListBm25MemorySuggestionsQuery = z.infer<
  typeof ListBm25MemorySuggestionsQuerySchema
>;

export type RawBm25MemorySuggestion = Omit<
  RawMemorySuggestion,
  "confidence" | "evidences"
> & {
  rawScore: number;
};

const parseSlotMapping = (raw: unknown): SlotMappingEntry[] | null => {
  const result = z.array(SlotMappingEntrySchema).safeParse(raw);
  return result.success ? result.data : null;
};

const buildBm25Expressions = (
  sourceLanguageId: string,
  sourceValue: typeof vectorizedString.value,
  trimmedText: string,
) => {
  if (sourceLanguageId === "en") {
    const queryVector = sql`to_tsvector('english', ${trimmedText})`;
    const tsQuery = sql`CASE
      WHEN cardinality(tsvector_to_array(${queryVector})) > 0
      THEN to_tsquery('english', array_to_string(tsvector_to_array(${queryVector}), ' | '))
      ELSE NULL::tsquery
    END`;
    const tsVector = sql`to_tsvector('english', ${sourceValue})`;
    return {
      tsQuery,
      tsVector,
      rawScore: sql<number>`rum_ts_score(${tsVector}, ${tsQuery})`,
      hasNodes: sql`${tsQuery} IS NOT NULL`,
    };
  }

  if (sourceLanguageId === "zh-Hans") {
    const queryVector = sql`to_tsvector('cat_zh_hans', ${trimmedText})`;
    const tsQuery = sql`CASE
      WHEN cardinality(tsvector_to_array(${queryVector})) > 0
      THEN to_tsquery('cat_zh_hans', array_to_string(tsvector_to_array(${queryVector}), ' | '))
      ELSE NULL::tsquery
    END`;
    const tsVector = sql`to_tsvector('cat_zh_hans', ${sourceValue})`;
    return {
      tsQuery,
      tsVector,
      rawScore: sql<number>`rum_ts_score(${tsVector}, ${tsQuery})`,
      hasNodes: sql`${tsQuery} IS NOT NULL`,
    };
  }

  return null;
};

export const listBm25MemorySuggestions: Query<
  ListBm25MemorySuggestionsQuery,
  RawBm25MemorySuggestion[]
> = async (ctx, query) => {
  if (query.memoryIds.length === 0) return [];

  const trimmedText = query.text.trim();
  if (trimmedText.length === 0) return [];

  const sourceString = aliasedTable(vectorizedString, "sourceString");
  const translationString = aliasedTable(vectorizedString, "translationString");

  const forwardExpressions = buildBm25Expressions(
    query.sourceLanguageId,
    sourceString.value,
    trimmedText,
  );
  const reversedExpressions = buildBm25Expressions(
    query.sourceLanguageId,
    translationString.value,
    trimmedText,
  );

  if (!forwardExpressions || !reversedExpressions) return [];

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
        rawScore: forwardExpressions.rawScore,
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
          forwardExpressions.hasNodes,
          sql`${forwardExpressions.tsVector} @@ ${forwardExpressions.tsQuery}`,
        ),
      )
      .orderBy(sql`${forwardExpressions.rawScore} DESC`)
      .limit(query.maxAmount),
    ctx.db
      .select({
        ...baseSelection,
        source: translationString.value,
        translation: sourceString.value,
        translationChunkSetId: sourceString.chunkSetId,
        rawScore: reversedExpressions.rawScore,
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
          reversedExpressions.hasNodes,
          sql`${reversedExpressions.tsVector} @@ ${reversedExpressions.tsQuery}`,
        ),
      )
      .orderBy(sql`${reversedExpressions.rawScore} DESC`)
      .limit(query.maxAmount),
  ]);

  return [
    ...new Map(
      [...forwardRows, ...reversedRows]
        .sort((a, b) => b.rawScore - a.rawScore)
        .map((row) => [row.id, row]),
    ).values(),
  ]
    .slice(0, query.maxAmount)
    .map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      slotMapping: parseSlotMapping(row.slotMapping),
    }));
};
