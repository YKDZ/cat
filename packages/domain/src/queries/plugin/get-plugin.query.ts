import { eq, plugin } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetPluginQuerySchema = z.object({
  pluginId: z.string(),
});

export type GetPluginQuery = z.infer<typeof GetPluginQuerySchema>;

export const getPlugin: Query<
  GetPluginQuery,
  typeof plugin.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select()
      .from(plugin)
      .where(eq(plugin.id, query.pluginId))
      .limit(1),
  );
};
