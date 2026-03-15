import { desc, getColumns, plugin } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListPluginsQuerySchema = z.object({}).optional();

export type ListPluginsQuery = z.infer<typeof ListPluginsQuerySchema>;

export const listPlugins: Query<
  ListPluginsQuery,
  (typeof plugin.$inferSelect)[]
> = async (ctx) => {
  return await ctx.db
    .select(getColumns(plugin))
    .from(plugin)
    .orderBy(desc(plugin.id));
};
