import { chunk, translatableString } from "@cat/db";
import { inArray } from "@cat/db";
import * as z from "zod/v4";

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

  // First get chunkSetIds from translatable strings
  const strings = await ctx.db
    .select({ chunkSetId: translatableString.chunkSetId })
    .from(translatableString)
    .where(inArray(translatableString.id, query.stringIds));

  const chunkSetIds = strings.map((s) => s.chunkSetId);

  if (chunkSetIds.length === 0) {
    return [];
  }

  return ctx.db
    .select()
    .from(chunk)
    .where(inArray(chunk.chunkSetId, chunkSetIds));
};
