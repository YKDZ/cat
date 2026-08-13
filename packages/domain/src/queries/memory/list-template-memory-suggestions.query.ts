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
  MemoryRecallVariantMetaSchema,
  NormalizedLanguageIdSchema,
  RecallDerivationVersionSchema,
} from "@cat/shared";
import * as z from "zod";

import type { RawMemorySuggestion } from "#/queries/memory/list-lexical-memory-suggestions.query.ts";
import type { Query } from "#/types.ts";

export const ListTemplateMemorySuggestionsQuerySchema = z.object({
  sourceTemplate: z.string(),
  sourceLanguageId: NormalizedLanguageIdSchema,
  translationLanguageId: NormalizedLanguageIdSchema,
  requiredDerivationVersion: RecallDerivationVersionSchema,
  memoryIds: z.array(z.uuidv4()),
  maxAmount: z.int().min(1).default(10),
});

export type ListTemplateMemorySuggestionsQuery = z.infer<
  typeof ListTemplateMemorySuggestionsQuerySchema
>;
type ListTemplateMemorySuggestionsQueryInput = z.input<
  typeof ListTemplateMemorySuggestionsQuerySchema
>;

/**
 * Query `MemoryRecallVariant` by direct equality match on `meta->>'template'`.
 *
 * This bypasses pg_trgm similarity entirely, making it suitable for
 * template-based recall where semantically-equivalent placeholder forms
 * (e.g. "1.20" → "1.21" → "{NUM_0}.{NUM_1}") would score too low under
 * trigram similarity to surface via the variant channel.
 *
 * The template string is stored in the variant's `meta` field under `"template"`.
 */
export const listTemplateMemorySuggestions: Query<
  ListTemplateMemorySuggestionsQueryInput,
  RawMemorySuggestion[]
> = async (ctx, input) => {
  const query = ListTemplateMemorySuggestionsQuerySchema.parse(input);
  if (query.memoryIds.length === 0) return [];

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
    matchedVariantText: memoryRecallVariant.text,
    matchedVariantType: memoryRecallVariant.variantType,
  };
  const freshConditions = [
    inArray(memoryItem.memoryId, query.memoryIds),
    eq(memoryRecallVariant.variantType, "TOKEN_TEMPLATE"),
    sql`${memoryRecallVariant.meta}->>'template' = ${query.sourceTemplate}`,
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
  ];
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
          ...freshConditions,
          eq(memoryRecallVariant.languageId, query.sourceLanguageId),
          eq(memoryRecallVariant.querySide, "SOURCE"),
          eq(sourceString.languageId, query.sourceLanguageId),
          eq(translationString.languageId, query.translationLanguageId),
        ),
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
          ...freshConditions,
          eq(memoryRecallVariant.languageId, query.sourceLanguageId),
          eq(memoryRecallVariant.querySide, "TRANSLATION"),
          eq(translationString.languageId, query.sourceLanguageId),
          eq(sourceString.languageId, query.translationLanguageId),
        ),
      )
      .limit(query.maxAmount),
  ]);
  const rows = [...forwardRows, ...reversedRows].slice(0, query.maxAmount);

  return rows.map((row) => {
    const meta = MemoryRecallVariantMetaSchema.parse(row.variantMeta);
    if (!("sourceTemplate" in meta)) {
      throw new TypeError("TOKEN_TEMPLATE variant has invalid metadata.");
    }
    return {
      id: row.id,
      source: row.source,
      translation: row.translation,
      translationChunkSetId: row.translationChunkSetId,
      memoryId: row.memoryId,
      creatorId: row.creatorId,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      confidence: 1,
      evidences: [
        {
          channel: "template" as const,
          matchedText: row.source,
          matchedVariantText: row.matchedVariantText,
          matchedVariantType: "TOKEN_TEMPLATE" as const,
          confidence: 1,
          note: "template structure equality match",
        },
      ],
      matchedText: row.source,
      matchedVariantText: row.matchedVariantText,
      matchedVariantType: row.matchedVariantType,
      sourceTemplate: meta.sourceTemplate,
      translationTemplate: meta.translationTemplate,
      slotMapping: meta.slotMapping,
    };
  });
};
