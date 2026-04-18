import { eq, pluginService } from "@cat/db";
import { PluginServiceTypeSchema } from "@cat/shared/schema/enum";
import * as z from "zod";

import type { Query } from "@/types";

export const ListPluginServiceIdsByTypeQuerySchema = z.object({
  serviceType: PluginServiceTypeSchema,
});

export type ListPluginServiceIdsByTypeQuery = z.infer<
  typeof ListPluginServiceIdsByTypeQuerySchema
>;

export const listPluginServiceIdsByType: Query<
  ListPluginServiceIdsByTypeQuery,
  string[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ serviceId: pluginService.serviceId })
    .from(pluginService)
    .where(eq(pluginService.serviceType, query.serviceType));

  return rows.map((row) => row.serviceId);
};
