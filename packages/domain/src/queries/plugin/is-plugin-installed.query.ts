import { and, eq, pluginInstallation } from "@cat/db";
import { ScopeTypeSchema } from "@cat/shared";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const IsPluginInstalledQuerySchema = z.object({
  pluginId: z.string(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
});

export type IsPluginInstalledQuery = z.infer<
  typeof IsPluginInstalledQuerySchema
>;

export const isPluginInstalled: Query<IsPluginInstalledQuery, boolean> = async (
  ctx,
  query,
) => {
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

  return installation !== null;
};
