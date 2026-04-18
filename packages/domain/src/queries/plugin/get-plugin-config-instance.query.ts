import {
  and,
  eq,
  getColumns,
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
} from "@cat/db";
import { ScopeTypeSchema } from "@cat/shared/schema/enum";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetPluginConfigInstanceQuerySchema = z.object({
  pluginId: z.string(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
});

export type GetPluginConfigInstanceQuery = z.infer<
  typeof GetPluginConfigInstanceQuerySchema
>;

export const getPluginConfigInstance: Query<
  GetPluginConfigInstanceQuery,
  typeof pluginConfigInstance.$inferSelect | null
> = async (ctx, query) => {
  const installation = assertSingleOrNull(
    await ctx.db
      .select({ id: pluginInstallation.id })
      .from(pluginInstallation)
      .where(
        and(
          eq(pluginInstallation.pluginId, query.pluginId),
          eq(pluginInstallation.scopeType, query.scopeType),
          eq(pluginInstallation.scopeId, query.scopeId),
        ),
      )
      .limit(1),
  );

  if (!installation) {
    return null;
  }

  return assertSingleOrNull(
    await ctx.db
      .select(getColumns(pluginConfigInstance))
      .from(pluginConfigInstance)
      .innerJoin(
        pluginConfig,
        eq(pluginConfigInstance.configId, pluginConfig.id),
      )
      .where(
        and(
          eq(pluginConfig.pluginId, query.pluginId),
          eq(pluginConfigInstance.pluginInstallationId, installation.id),
        ),
      )
      .limit(1),
  );
};
