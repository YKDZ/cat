import { eq, getColumns, memory } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListOwnedMemoriesQuerySchema = z.object({
  creatorId: z.uuidv4(),
});

export type ListOwnedMemoriesQuery = z.infer<
  typeof ListOwnedMemoriesQuerySchema
>;

export const listOwnedMemories: Query<
  ListOwnedMemoriesQuery,
  Array<typeof memory.$inferSelect>
> = async (ctx, query) => {
  return ctx.db
    .select(getColumns(memory))
    .from(memory)
    .where(eq(memory.creatorId, query.creatorId));
};
