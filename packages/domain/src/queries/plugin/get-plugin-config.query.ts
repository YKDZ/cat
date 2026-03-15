import { eq, pluginConfig } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetPluginConfigQuerySchema = z.object({
  pluginId: z.string(),
});

export type GetPluginConfigQuery = z.infer<typeof GetPluginConfigQuerySchema>;

export const getPluginConfig: Query<
  GetPluginConfigQuery,
  typeof pluginConfig.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select()
      .from(pluginConfig)
      .where(eq(pluginConfig.pluginId, query.pluginId))
      .limit(1),
  );
};
