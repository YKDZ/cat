import { memory } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListAllMemoriesQuerySchema = z.object({});

export type ListAllMemoriesQuery = z.infer<typeof ListAllMemoriesQuerySchema>;

export const listAllMemories: Query<
  ListAllMemoriesQuery,
  Array<typeof memory.$inferSelect>
> = async (ctx, _query) => {
  return ctx.db.select().from(memory);
};
