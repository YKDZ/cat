import { and, eq, pluginConfig, pluginInstallation } from "@cat/db";
import { ScopeTypeSchema } from "@cat/shared";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

import {
  getValidatedPluginConfigDefault,
  lockPluginConfigDefinition,
} from "./plugin-config-contract.ts";
import { writePluginConfigInstanceInTransaction } from "./write-plugin-config-instance.cmd.ts";

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
    await lockPluginConfigDefinition(tx, command.pluginId);
    const inserted = await tx
      .insert(pluginInstallation)
      .values([
        {
          pluginId: command.pluginId,
          scopeType: command.scopeType,
          scopeId: command.scopeId,
        },
      ])
      .onConflictDoNothing()
      .returning({ id: pluginInstallation.id });
    if (!inserted[0]) {
      assertSingleNonNullish(
        await tx
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
      );
      return;
    }

    const pluginConfigs = await tx
      .select({
        id: pluginConfig.id,
        schema: pluginConfig.schema,
        schemaVersion: pluginConfig.schemaVersion,
        schemaDigest: pluginConfig.schemaDigest,
        isAvailable: pluginConfig.isAvailable,
      })
      .from(pluginConfig)
      .where(eq(pluginConfig.pluginId, command.pluginId));

    for (const config of pluginConfigs.filter((item) => item.isAvailable)) {
      const created = await writePluginConfigInstanceInTransaction(tx, {
        pluginId: command.pluginId,
        scopeType: command.scopeType,
        scopeId: command.scopeId,
        value: getValidatedPluginConfigDefault(config.schema),
        expectedSchemaVersion: config.schemaVersion,
        expectedSchemaDigest: config.schemaDigest,
        expectedRevision: null,
      });
      if (!created) {
        throw new Error("Plugin configuration instance creation conflicted");
      }
    }
  });

  return { result: void 0, events: [] };
};
