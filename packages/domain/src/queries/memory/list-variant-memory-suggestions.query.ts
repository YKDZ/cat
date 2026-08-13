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
import type { MemoryRecallVariantMeta, SlotMappingEntry } from "@cat/shared";
import {
  MemoryRecallVariantMetaSchema,
  NormalizedLanguageIdSchema,
  RecallDerivationVersionSchema,
} from "@cat/shared";
import * as z from "zod";

import type { RawMemorySuggestion } from "#/queries/memory/list-lexical-memory-suggestions.query.ts";
import type { Query } from "#/types.ts";

export const ListVariantMemorySuggestionsQuerySchema = z.object({
  text: z.string(),
  normalizedText: z.string(),
  sourceLanguageId: NormalizedLanguageIdSchema,
  translationLanguageId: NormalizedLanguageIdSchema,
  requiredDerivationVersion: RecallDerivationVersionSchema,
  memoryIds: z.array(z.uuidv4()),
  minSimilarity: z.number().min(0).max(1).default(0.7),
  maxAmount: z.int().min(1).default(10),
});

export type ListVariantMemorySuggestionsQuery = z.infer<
  typeof ListVariantMemorySuggestionsQuerySchema
>;
type ListVariantMemorySuggestionsQueryInput = z.input<
  typeof ListVariantMemorySuggestionsQuerySchema
>;

const parseTemplateArtifact = (
  raw: unknown,
): {
  sourceTemplate: string | null;
  translationTemplate: string | null;
  slotMapping: SlotMappingEntry[] | null;
} => {
  const result = MemoryRecallVariantMetaSchema.safeParse(raw);
  const meta: MemoryRecallVariantMeta | null = result.success
    ? result.data
    : null;
  return meta && "sourceTemplate" in meta
    ? {
        sourceTemplate: meta.sourceTemplate,
        translationTemplate: meta.translationTemplate,
        slotMapping: meta.slotMapping,
      }
    : { sourceTemplate: null, translationTemplate: null, slotMapping: null };
};

const toEvidenceLane = (variantType: string) => {
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
  ListVariantMemorySuggestionsQueryInput,
  RawMemorySuggestion[]
> = async (ctx, input) => {
  const query = ListVariantMemorySuggestionsQuerySchema.parse(input);
  if (query.memoryIds.length === 0) return [];

  const normalizedText = query.normalizedText.trim();
  if (normalizedText.length === 0) return [];

  const sourceString = aliasedTable(vectorizedString, "sourceString");
  const translationString = aliasedTable(vectorizedString, "translationString");

  const baseSelection = {
    id: memoryItem.id,
    translationId: memoryItem.translationId,
    memoryId: memoryItem.memoryId,
    creatorId: memoryItem.creatorId,
    createdAt: memoryItem.createdAt,
    updatedAt: memoryItem.updatedAt,
    variantMeta: memoryRecallVariant.meta,
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
          inArray(memoryItem.memoryId, query.memoryIds),
          eq(memoryRecallVariant.languageId, query.sourceLanguageId),
          eq(memoryRecallVariant.querySide, "SOURCE"),
          eq(recallDerivationState.status, "FRESH"),
          eq(
            memoryRecallVariant.recallDerivationVersion,
            query.requiredDerivationVersion,
          ),
          eq(
            recallDerivationState.currentDerivationVersion,
            query.requiredDerivationVersion,
          ),
          eq(
            recallDerivationState.requiredDerivationVersion,
            query.requiredDerivationVersion,
          ),
          eq(
            memoryRecallVariant.canonicalInputVersion,
            recallDerivationState.currentCanonicalInputVersion,
          ),
          eq(
            memoryRecallVariant.recallDerivationVersion,
            recallDerivationState.currentDerivationVersion,
          ),
          eq(
            recallDerivationState.currentCanonicalInputVersion,
            recallDerivationState.canonicalInputVersion,
          ),
          eq(
            recallDerivationState.currentDerivationVersion,
            recallDerivationState.requiredDerivationVersion,
          ),
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
          inArray(memoryItem.memoryId, query.memoryIds),
          eq(memoryRecallVariant.languageId, query.sourceLanguageId),
          eq(memoryRecallVariant.querySide, "TRANSLATION"),
          eq(recallDerivationState.status, "FRESH"),
          eq(
            memoryRecallVariant.recallDerivationVersion,
            query.requiredDerivationVersion,
          ),
          eq(
            recallDerivationState.currentDerivationVersion,
            query.requiredDerivationVersion,
          ),
          eq(
            recallDerivationState.requiredDerivationVersion,
            query.requiredDerivationVersion,
          ),
          eq(
            memoryRecallVariant.canonicalInputVersion,
            recallDerivationState.currentCanonicalInputVersion,
          ),
          eq(
            memoryRecallVariant.recallDerivationVersion,
            recallDerivationState.currentDerivationVersion,
          ),
          eq(
            recallDerivationState.currentCanonicalInputVersion,
            recallDerivationState.canonicalInputVersion,
          ),
          eq(
            recallDerivationState.currentDerivationVersion,
            recallDerivationState.requiredDerivationVersion,
          ),
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

  const rows = [...forwardRows, ...reversedRows]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, query.maxAmount);

  return rows.map((row) => ({
    ...parseTemplateArtifact(row.variantMeta),
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
        channel: toEvidenceLane(row.matchedVariantType),
        matchedText: row.source,
        matchedVariantText: row.matchedVariantText,
        matchedVariantType: row.matchedVariantType,
        confidence: row.confidence,
        note: "recall variant similarity match",
      },
    ],
    matchedText: row.source,
    matchedVariantText: row.matchedVariantText,
    matchedVariantType: row.matchedVariantType,
  }));
};
