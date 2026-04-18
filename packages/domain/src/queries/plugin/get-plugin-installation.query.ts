import { and, eq, pluginInstallation } from "@cat/db";
import { ScopeTypeSchema } from "@cat/shared/schema/enum";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetPluginInstallationQuerySchema = z.object({
  pluginId: z.string(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
});

export type GetPluginInstallationQuery = z.infer<
  typeof GetPluginInstallationQuerySchema
>;

export const getPluginInstallation: Query<
  GetPluginInstallationQuery,
  { id: number } | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ id: pluginInstallation.id })
      .from(pluginInstallation)
      .where(
        and(
          eq(pluginInstallation.pluginId, query.pluginId),
          eq(pluginInstallation.scopeId, query.scopeId),
          eq(pluginInstallation.scopeType, query.scopeType),
        ),
      )
      .limit(1),
  );
};
