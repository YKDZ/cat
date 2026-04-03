import { eq, pluginInstallation } from "@cat/db";
import { and } from "@cat/db";
import { ScopeTypeSchema } from "@cat/shared/schema/enum";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListInstalledPluginsQuerySchema = z.object({
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
});

export type ListInstalledPluginsQuery = z.infer<
  typeof ListInstalledPluginsQuerySchema
>;

export const listInstalledPlugins: Query<
  ListInstalledPluginsQuery,
  { pluginId: string }[]
> = async (ctx, query) => {
  return ctx.db
    .select({ pluginId: pluginInstallation.pluginId })
    .from(pluginInstallation)
    .where(
      and(
        eq(pluginInstallation.scopeType, query.scopeType),
        eq(pluginInstallation.scopeId, query.scopeId),
      ),
    );
};
