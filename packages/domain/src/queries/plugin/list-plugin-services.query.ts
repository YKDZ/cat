import { eq, pluginService } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListPluginServicesQuerySchema = z.object({
  pluginInstallationId: z.int(),
});

export type ListPluginServicesQuery = z.infer<
  typeof ListPluginServicesQuerySchema
>;

export type PluginServiceDbRecord = {
  id: number;
  serviceId: string;
  serviceType: string;
};

export const listPluginServices: Query<
  ListPluginServicesQuery,
  PluginServiceDbRecord[]
> = async (ctx, query) => {
  return ctx.db
    .select({
      id: pluginService.id,
      serviceId: pluginService.serviceId,
      serviceType: pluginService.serviceType,
    })
    .from(pluginService)
    .where(eq(pluginService.pluginInstallationId, query.pluginInstallationId));
};
