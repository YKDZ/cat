import { chunk } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListAllChunksQuerySchema = z.object();

export type ListAllChunksQuery = z.infer<typeof ListAllChunksQuerySchema>;

export const listAllChunks: Query<
  ListAllChunksQuery,
  Array<typeof chunk.$inferSelect>
> = async (ctx, _) => {
  return ctx.db.select().from(chunk);
};
