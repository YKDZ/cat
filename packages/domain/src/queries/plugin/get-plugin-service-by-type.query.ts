import type { PluginServiceType } from "@cat/shared";

import { eq, pluginService } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetPluginServiceByTypeQuerySchema = z.object({
  serviceType: z.string(),
});

export type GetPluginServiceByTypeQuery = z.infer<
  typeof GetPluginServiceByTypeQuerySchema
>;

export const getPluginServiceByType: Query<
  GetPluginServiceByTypeQuery,
  typeof pluginService.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select()
      .from(pluginService)
      .where(
        // oxlint-disable-next-line no-unsafe-type-assertion
        eq(pluginService.serviceType, query.serviceType as PluginServiceType),
      )
      .limit(1),
  );
};
