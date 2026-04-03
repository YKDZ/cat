import {
  and,
  eq,
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
} from "@cat/db";
import { ScopeTypeSchema } from "@cat/shared/schema/enum";
import { nonNullSafeZDotJson } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const UpsertPluginConfigInstanceCommandSchema = z.object({
  pluginId: z.string(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
  creatorId: z.uuidv4(),
  value: nonNullSafeZDotJson,
});

export type UpsertPluginConfigInstanceCommand = z.infer<
  typeof UpsertPluginConfigInstanceCommandSchema
>;

export const upsertPluginConfigInstance: Command<
  UpsertPluginConfigInstanceCommand,
  typeof pluginConfigInstance.$inferSelect
> = async (ctx, command) => {
  const installation = assertSingleNonNullish(
    await ctx.db
      .select({ id: pluginInstallation.id })
      .from(pluginInstallation)
      .where(
        and(
          eq(pluginInstallation.pluginId, command.pluginId),
          eq(pluginInstallation.scopeType, command.scopeType),
          eq(pluginInstallation.scopeId, command.scopeId),
        ),
      )
      .limit(1),
    "Plugin not installed",
  );

  const config = assertSingleNonNullish(
    await ctx.db
      .select({ id: pluginConfig.id })
      .from(pluginConfig)
      .where(eq(pluginConfig.pluginId, command.pluginId))
      .limit(1),
    "Plugin config not found",
  );

  const result = assertSingleNonNullish(
    await ctx.db
      .insert(pluginConfigInstance)
      .values({
        value: command.value,
        creatorId: command.creatorId,
        configId: config.id,
        pluginInstallationId: installation.id,
      })
      .onConflictDoUpdate({
        target: [
          pluginConfigInstance.pluginInstallationId,
          pluginConfigInstance.configId,
        ],
        set: {
          value: command.value,
        },
      })
      .returning(),
  );

  return {
    result,
    events: [],
  };
};
