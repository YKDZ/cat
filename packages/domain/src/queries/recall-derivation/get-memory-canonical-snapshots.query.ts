import {
  aliasedTable,
  eq,
  inArray,
  memoryItem,
  vectorizedString,
} from "@cat/db";
import {
  MemoryCanonicalSnapshotSchema,
  type MemoryCanonicalSnapshot,
} from "@cat/shared";
import * as z from "zod";

import type { DbContext, Query } from "#/types.ts";

export const GetMemoryCanonicalSnapshotsQuerySchema = z.strictObject({
  memoryItemIds: z.array(z.int().positive()),
});

export const listMemoryCanonicalSnapshots = async (
  ctx: DbContext,
  memoryItemIds: readonly number[],
): Promise<MemoryCanonicalSnapshot[]> => {
  if (memoryItemIds.length === 0) return [];
  const sourceString = aliasedTable(vectorizedString, "sourceString");
  const translationString = aliasedTable(vectorizedString, "translationString");
  const rows = await ctx.db
    .select({
      id: memoryItem.id,
      memoryId: memoryItem.memoryId,
      creatorId: memoryItem.creatorId,
      sourceElementId: memoryItem.sourceElementId,
      translationId: memoryItem.translationId,
      source: {
        id: sourceString.id,
        value: sourceString.value,
        languageId: sourceString.languageId,
      },
      translation: {
        id: translationString.id,
        value: translationString.value,
        languageId: translationString.languageId,
      },
    })
    .from(memoryItem)
    .innerJoin(sourceString, eq(sourceString.id, memoryItem.sourceStringId))
    .innerJoin(
      translationString,
      eq(translationString.id, memoryItem.translationStringId),
    )
    .where(inArray(memoryItem.id, [...memoryItemIds]));
  return rows.map((row) => MemoryCanonicalSnapshotSchema.parse(row));
};

export const getMemoryCanonicalSnapshots: Query<
  z.infer<typeof GetMemoryCanonicalSnapshotsQuerySchema>,
  MemoryCanonicalSnapshot[]
> = async (ctx, input) =>
  await listMemoryCanonicalSnapshots(ctx, input.memoryItemIds);
