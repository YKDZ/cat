import { chunk, vectorizedString } from "@cat/db";
import { and, inArray, isNotNull } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListChunksByStringIdsQuerySchema = z.object({
  stringIds: z.array(z.int()),
});

export type ListChunksByStringIdsQuery = z.infer<
  typeof ListChunksByStringIdsQuerySchema
>;

export const listChunksByStringIds: Query<
  ListChunksByStringIdsQuery,
  Array<typeof chunk.$inferSelect>
> = async (ctx, query) => {
  if (query.stringIds.length === 0) {
    return [];
  }

  // First get chunkSetIds from vectorized strings
  const strings = await ctx.db
    .select({ chunkSetId: vectorizedString.chunkSetId })
    .from(vectorizedString)
    .where(
      and(
        inArray(vectorizedString.id, query.stringIds),
        isNotNull(vectorizedString.chunkSetId),
      ),
    );

  const chunkSetIds = strings
    .map((s) => s.chunkSetId)
    .filter((id): id is number => id !== null);

  if (chunkSetIds.length === 0) {
    return [];
  }

  return ctx.db
    .select()
    .from(chunk)
    .where(inArray(chunk.chunkSetId, chunkSetIds));
};
