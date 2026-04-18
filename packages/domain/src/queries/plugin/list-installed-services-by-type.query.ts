import { and, eq, pluginInstallation, pluginService } from "@cat/db";
import {
  PluginServiceTypeSchema,
  ScopeTypeSchema,
} from "@cat/shared/schema/enum";
import * as z from "zod";

import type { Query } from "@/types";

export const ListInstalledServicesByTypeQuerySchema = z.object({
  serviceType: PluginServiceTypeSchema,
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
});

export type ListInstalledServicesByTypeQuery = z.infer<
  typeof ListInstalledServicesByTypeQuerySchema
>;

export type InstalledServiceRecord = {
  dbId: number;
  serviceId: string;
  serviceType: string;
  pluginId: string;
};

export const listInstalledServicesByType: Query<
  ListInstalledServicesByTypeQuery,
  InstalledServiceRecord[]
> = async (ctx, query) => {
  return ctx.db
    .select({
      dbId: pluginService.id,
      serviceId: pluginService.serviceId,
      serviceType: pluginService.serviceType,
      pluginId: pluginInstallation.pluginId,
    })
    .from(pluginService)
    .innerJoin(
      pluginInstallation,
      and(
        eq(pluginInstallation.id, pluginService.pluginInstallationId),
        eq(pluginInstallation.scopeType, query.scopeType),
        eq(pluginInstallation.scopeId, query.scopeId),
      ),
    )
    .where(eq(pluginService.serviceType, query.serviceType));
};
