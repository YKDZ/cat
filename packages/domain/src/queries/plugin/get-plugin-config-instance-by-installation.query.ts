import type { _JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";

import {
  and,
  eq,
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
} from "@cat/db";
import { ScopeTypeSchema } from "@cat/shared/schema/enum";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetPluginConfigInstanceByInstallationQuerySchema = z.object({
  pluginId: z.string(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
});

export type GetPluginConfigInstanceByInstallationQuery = z.infer<
  typeof GetPluginConfigInstanceByInstallationQuerySchema
>;

export type PluginConfigInstanceData = {
  configId: number;
  instanceId: number;
  schema: _JSONSchema;
  value: NonNullJSONType;
};

export const getPluginConfigInstanceByInstallation: Query<
  GetPluginConfigInstanceByInstallationQuery,
  PluginConfigInstanceData | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({
      configId: pluginConfig.id,
      instanceId: pluginConfigInstance.id,
      schema: pluginConfig.schema,
      value: pluginConfigInstance.value,
    })
    .from(pluginConfigInstance)
    .innerJoin(pluginConfig, eq(pluginConfigInstance.configId, pluginConfig.id))
    .innerJoin(
      pluginInstallation,
      eq(pluginConfigInstance.pluginInstallationId, pluginInstallation.id),
    )
    .where(
      and(
        eq(pluginInstallation.pluginId, query.pluginId),
        eq(pluginInstallation.scopeId, query.scopeId),
        eq(pluginInstallation.scopeType, query.scopeType),
        eq(pluginConfig.pluginId, query.pluginId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
};
