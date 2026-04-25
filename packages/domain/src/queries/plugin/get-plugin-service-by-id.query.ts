import { and, eq, pluginInstallation, pluginService } from "@cat/db";
import { PluginServiceTypeSchema } from "@cat/shared";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetPluginServiceByIdQuerySchema = z.object({
  serviceDbId: z.int(),
  serviceType: PluginServiceTypeSchema,
});

export type GetPluginServiceByIdQuery = z.infer<
  typeof GetPluginServiceByIdQuerySchema
>;

export type PluginServiceIdentity = {
  pluginId: string;
  serviceId: string;
  serviceType: z.infer<typeof PluginServiceTypeSchema>;
};

export const getPluginServiceById: Query<
  GetPluginServiceByIdQuery,
  PluginServiceIdentity | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({
        pluginId: pluginInstallation.pluginId,
        serviceId: pluginService.serviceId,
        serviceType: pluginService.serviceType,
      })
      .from(pluginService)
      .innerJoin(
        pluginInstallation,
        eq(pluginService.pluginInstallationId, pluginInstallation.id),
      )
      .where(
        and(
          eq(pluginService.id, query.serviceDbId),
          eq(pluginService.serviceType, query.serviceType),
        ),
      )
      .limit(1),
  );
};
