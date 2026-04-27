import type { SlotMappingEntry } from "@cat/shared";

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
import { SlotMappingEntrySchema } from "@cat/shared";
import * as z from "zod";

import type { RawMemorySuggestion } from "@/queries/memory/list-lexical-memory-suggestions.query";
import type { Query } from "@/types";

export const ListTemplateMemorySuggestionsQuerySchema = z.object({
  sourceTemplate: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  memoryIds: z.array(z.uuidv4()),
  maxAmount: z.int().min(1).default(10),
});

export type ListTemplateMemorySuggestionsQuery = z.infer<
  typeof ListTemplateMemorySuggestionsQuerySchema
>;

const parseSlotMapping = (raw: unknown): SlotMappingEntry[] | null => {
  const result = z.array(SlotMappingEntrySchema).safeParse(raw);
  return result.success ? result.data : null;
};

/**
 * Query `MemoryRecallVariant` by direct equality match on `meta->>'template'`.
 *
 * This bypasses pg_trgm similarity entirely, making it suitable for
 * template-based recall where semantically-equivalent placeholder forms
 * (e.g. "1.20" → "1.21" → "{NUM_0}.{NUM_1}") would score too low under
 * trigram similarity to surface via the variant channel.
 *
 * The template string is stored in the variant's `meta` field during variant
 * building (`buildMemoryRecallVariantsOp`), keyed as `"template"`.
 */
export const listTemplateMemorySuggestions: Query<
  ListTemplateMemorySuggestionsQuery,
  RawMemorySuggestion[]
> = async (ctx, query) => {
  if (query.memoryIds.length === 0) return [];

  const sourceString = aliasedTable(vectorizedString, "sourceString");
  const translationString = aliasedTable(vectorizedString, "translationString");

  const rows = await ctx.db
    .select({
      id: memoryItem.id,
      memoryId: memoryItem.memoryId,
      creatorId: memoryItem.creatorId,
      createdAt: memoryItem.createdAt,
      updatedAt: memoryItem.updatedAt,
      sourceTemplate: memoryItem.sourceTemplate,
      translationTemplate: memoryItem.translationTemplate,
      slotMapping: memoryItem.slotMapping,
      matchedVariantText: memoryRecallVariant.text,
      matchedVariantType: memoryRecallVariant.variantType,
      source: sourceString.value,
      translation: translationString.value,
      translationChunkSetId: translationString.chunkSetId,
    })
    .from(memoryRecallVariant)
    .innerJoin(memoryItem, eq(memoryItem.id, memoryRecallVariant.memoryItemId))
    .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
    .innerJoin(
      translationString,
      eq(translationString.id, memoryItem.translationStringId),
    )
    .where(
      and(
        inArray(memoryItem.memoryId, query.memoryIds),
        eq(memoryRecallVariant.variantType, "TOKEN_TEMPLATE"),
        sql`${memoryRecallVariant.meta}->>'template' = ${query.sourceTemplate}`,
        eq(sourceString.languageId, query.sourceLanguageId),
        eq(translationString.languageId, query.translationLanguageId),
      ),
    )
    .limit(query.maxAmount);

  return rows.map((row) => ({
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
    sourceTemplate: row.sourceTemplate,
    translationTemplate: row.translationTemplate,
    slotMapping: parseSlotMapping(row.slotMapping),
  }));
};
