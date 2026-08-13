import {
  aliasedTable,
  and,
  eq,
  inArray,
  memoryItem,
  memoryRecallVariant,
  recallDerivationState,
  sql,
  vectorizedString,
} from "@cat/db";
import {
  NormalizedLanguageIdSchema,
  RecallDerivationVersionSchema,
} from "@cat/shared";
import * as z from "zod";

import type { RawMemorySuggestion } from "#/queries/memory/list-lexical-memory-suggestions.query.ts";
import type { Query } from "#/types.ts";

export const ListKeywordMemorySuggestionsQuerySchema = z.strictObject({
  keywords: z.array(z.string().min(1)).min(1),
  sourceLanguageId: NormalizedLanguageIdSchema,
  translationLanguageId: NormalizedLanguageIdSchema,
  requiredDerivationVersion: RecallDerivationVersionSchema,
  memoryIds: z.array(z.uuidv4()),
  maxAmount: z.int().min(1),
});

export type ListKeywordMemorySuggestionsQuery = z.infer<
  typeof ListKeywordMemorySuggestionsQuerySchema
>;
type ListKeywordMemorySuggestionsQueryInput = z.input<
  typeof ListKeywordMemorySuggestionsQuerySchema
>;

type KeywordRow = {
  id: number;
  translationId: number | null;
  memoryId: string;
  creatorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  source: string;
  translation: string;
  translationChunkSetId: number | null;
  matchedKeywords: string[];
};

const toSuggestions = (
  rows: KeywordRow[],
  keywords: string[],
  maxAmount: number,
): RawMemorySuggestion[] => {
  const grouped = new Map<
    number,
    { row: KeywordRow; matchedKeywords: Set<string> }
  >();
  for (const row of rows) {
    const existing = grouped.get(row.id);
    if (existing) {
      for (const keyword of row.matchedKeywords) {
        existing.matchedKeywords.add(keyword);
      }
    } else {
      grouped.set(row.id, {
        row,
        matchedKeywords: new Set(row.matchedKeywords),
      });
    }
  }

  return [...grouped.values()]
    .map(({ row, matchedKeywords }) => {
      const matchedText = [...matchedKeywords].sort().join(" ");
      const confidence = matchedKeywords.size / keywords.length;
      return {
        id: row.id,
        translationId: row.translationId,
        memoryId: row.memoryId,
        creatorId: row.creatorId,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        source: row.source,
        translation: row.translation,
        translationChunkSetId: row.translationChunkSetId,
        sourceTemplate: null,
        translationTemplate: null,
        slotMapping: null,
        confidence,
        matchedText,
        evidences: [
          {
            channel: "keyword" as const,
            matchedText,
            confidence,
            note: "analyzer-backed Recall Variant keyword overlap",
          },
        ],
      };
    })
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, maxAmount);
};

export const listKeywordMemorySuggestions: Query<
  ListKeywordMemorySuggestionsQueryInput,
  RawMemorySuggestion[]
> = async (ctx, input) => {
  const query = ListKeywordMemorySuggestionsQuerySchema.parse(input);
  if (query.memoryIds.length === 0) return [];

  const keywords = [...new Set(query.keywords)];
  const sourceString = aliasedTable(vectorizedString, "sourceString");
  const translationString = aliasedTable(vectorizedString, "translationString");
  const commonConditions = [
    inArray(memoryItem.memoryId, query.memoryIds),
    eq(memoryRecallVariant.languageId, query.sourceLanguageId),
    eq(memoryRecallVariant.variantType, "LEMMA"),
    inArray(memoryRecallVariant.normalizedText, keywords),
    eq(recallDerivationState.status, "FRESH"),
    eq(
      recallDerivationState.requiredDerivationVersion,
      query.requiredDerivationVersion,
    ),
    eq(
      recallDerivationState.currentDerivationVersion,
      query.requiredDerivationVersion,
    ),
    eq(
      recallDerivationState.currentCanonicalInputVersion,
      recallDerivationState.canonicalInputVersion,
    ),
    eq(
      memoryRecallVariant.canonicalInputVersion,
      recallDerivationState.canonicalInputVersion,
    ),
    eq(
      memoryRecallVariant.recallDerivationVersion,
      query.requiredDerivationVersion,
    ),
  ];
  const baseSelection = {
    id: memoryItem.id,
    translationId: memoryItem.translationId,
    memoryId: memoryItem.memoryId,
    creatorId: memoryItem.creatorId,
    createdAt: memoryItem.createdAt,
    updatedAt: memoryItem.updatedAt,
    matchedKeywords: sql<
      string[]
    >`array_agg(DISTINCT ${memoryRecallVariant.normalizedText})`,
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
      .innerJoin(
        recallDerivationState,
        eq(recallDerivationState.id, memoryRecallVariant.derivationStateId),
      )
      .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
      .innerJoin(
        translationString,
        eq(translationString.id, memoryItem.translationStringId),
      )
      .where(
        and(
          ...commonConditions,
          eq(memoryRecallVariant.querySide, "SOURCE"),
          eq(sourceString.languageId, query.sourceLanguageId),
          eq(translationString.languageId, query.translationLanguageId),
        ),
      )
      .groupBy(
        memoryItem.id,
        memoryItem.translationId,
        memoryItem.memoryId,
        memoryItem.creatorId,
        memoryItem.createdAt,
        memoryItem.updatedAt,
        sourceString.value,
        translationString.value,
        translationString.chunkSetId,
      )
      .orderBy(
        sql`count(DISTINCT ${memoryRecallVariant.normalizedText}) DESC`,
        memoryItem.id,
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
      .innerJoin(
        recallDerivationState,
        eq(recallDerivationState.id, memoryRecallVariant.derivationStateId),
      )
      .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
      .innerJoin(
        translationString,
        eq(translationString.id, memoryItem.translationStringId),
      )
      .where(
        and(
          ...commonConditions,
          eq(memoryRecallVariant.querySide, "TRANSLATION"),
          eq(translationString.languageId, query.sourceLanguageId),
          eq(sourceString.languageId, query.translationLanguageId),
        ),
      )
      .groupBy(
        memoryItem.id,
        memoryItem.translationId,
        memoryItem.memoryId,
        memoryItem.creatorId,
        memoryItem.createdAt,
        memoryItem.updatedAt,
        translationString.value,
        sourceString.value,
        sourceString.chunkSetId,
      )
      .orderBy(
        sql`count(DISTINCT ${memoryRecallVariant.normalizedText}) DESC`,
        memoryItem.id,
      )
      .limit(query.maxAmount),
  ]);

  return toSuggestions(
    [...forwardRows, ...reversedRows],
    keywords,
    query.maxAmount,
  );
};
