import { and, eq, pluginInstallation, pluginService } from "@cat/db";
import {
  PluginServiceTypeSchema,
  ScopeTypeSchema,
} from "@cat/shared/schema/drizzle/enum";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListPluginServicesForInstallationQuerySchema = z.object({
  pluginId: z.string(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
});

export type ListPluginServicesForInstallationQuery = z.infer<
  typeof ListPluginServicesForInstallationQuerySchema
>;

export type PluginServiceRecord = {
  type: z.infer<typeof PluginServiceTypeSchema>;
  id: string;
  dbId: number;
};

export const listPluginServicesForInstallation: Query<
  ListPluginServicesForInstallationQuery,
  PluginServiceRecord[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({
      type: pluginService.serviceType,
      id: pluginService.serviceId,
      dbId: pluginService.id,
    })
    .from(pluginInstallation)
    .innerJoin(
      pluginService,
      eq(pluginService.pluginInstallationId, pluginInstallation.id),
    )
    .where(
      and(
        eq(pluginInstallation.scopeType, query.scopeType),
        eq(pluginInstallation.scopeId, query.scopeId),
        eq(pluginInstallation.pluginId, query.pluginId),
      ),
    );

  return rows;
};
