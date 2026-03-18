import {
  eq,
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
} from "@cat/db";
import { ScopeTypeSchema } from "@cat/shared/schema/drizzle/enum";
import { JSONSchemaSchema } from "@cat/shared/schema/json";
import {
  assertSingleNonNullish,
  getDefaultFromSchema,
} from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const InstallPluginCommandSchema = z.object({
  pluginId: z.string(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
});

export type InstallPluginCommand = z.infer<typeof InstallPluginCommandSchema>;

export const installPlugin: Command<InstallPluginCommand> = async (
  ctx,
  command,
) => {
  await ctx.db.transaction(async (tx) => {
    const installation = assertSingleNonNullish(
      await tx
        .insert(pluginInstallation)
        .values([
          {
            pluginId: command.pluginId,
            scopeType: command.scopeType,
            scopeId: command.scopeId,
          },
        ])
        .returning({ id: pluginInstallation.id }),
    );

    const pluginConfigs = await tx
      .select({ id: pluginConfig.id, schema: pluginConfig.schema })
      .from(pluginConfig)
      .where(eq(pluginConfig.pluginId, command.pluginId));

    if (pluginConfigs.length > 0) {
      await tx.insert(pluginConfigInstance).values(
        pluginConfigs.map((config) => ({
          configId: config.id,
          pluginInstallationId: installation.id,
          value:
            getDefaultFromSchema(JSONSchemaSchema.parse(config.schema)) ?? {},
        })),
      );
    }
  });

  return { result: void 0, events: [] };
};
