import { and, eq, pluginConfig, pluginInstallation } from "@cat/db";
import {
  ScopeTypeSchema,
  nonNullSafeZDotJson,
  type NonNullJSONType,
  type ScopeType,
} from "@cat/shared";
import * as z from "zod";

import type { Command, DbHandle } from "#/types.ts";

import {
  assertPluginConfigValueMatchesSchema,
  lockPluginConfigDefinition,
} from "./plugin-config-contract.ts";
import { writePluginConfigInstanceInTransaction } from "./write-plugin-config-instance.cmd.ts";

export const InstallPluginWithConfigIfAbsentCommandSchema = z.object({
  pluginId: z.string(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
  value: nonNullSafeZDotJson,
});

export type InstallPluginWithConfigIfAbsentCommand = {
  pluginId: string;
  scopeType: ScopeType;
  scopeId: string;
  value: NonNullJSONType;
};

export type InstallPluginWithConfigIfAbsentResult =
  | {
      status: "installed";
      schemaDigest: string;
      schemaVersion: string;
    }
  | { status: "existing" };

/**
 * Installs one plugin and writes its first configuration in one transaction.
 * Existing installations are intentionally left untouched for their operator.
 */
export const installPluginWithConfigIfAbsentInTransaction = async (
  tx: DbHandle,
  command: InstallPluginWithConfigIfAbsentCommand,
): Promise<InstallPluginWithConfigIfAbsentResult> => {
  await lockPluginConfigDefinition(tx, command.pluginId);
  const [definition] = await tx
    .select({
      schema: pluginConfig.schema,
      schemaDigest: pluginConfig.schemaDigest,
      schemaVersion: pluginConfig.schemaVersion,
      isAvailable: pluginConfig.isAvailable,
      existingInstallationId: pluginInstallation.id,
    })
    .from(pluginConfig)
    .leftJoin(
      pluginInstallation,
      and(
        eq(pluginInstallation.pluginId, pluginConfig.pluginId),
        eq(pluginInstallation.scopeType, command.scopeType),
        eq(pluginInstallation.scopeId, command.scopeId),
      ),
    )
    .where(eq(pluginConfig.pluginId, command.pluginId))
    .limit(1);

  if (!definition || !definition.isAvailable) {
    throw new Error(
      `Plugin ${command.pluginId} has no available configuration definition`,
    );
  }
  if (definition.existingInstallationId !== null) return { status: "existing" };

  assertPluginConfigValueMatchesSchema(definition.schema, command.value);
  const [installation] = await tx
    .insert(pluginInstallation)
    .values({
      pluginId: command.pluginId,
      scopeType: command.scopeType,
      scopeId: command.scopeId,
    })
    .returning({ id: pluginInstallation.id });
  if (!installation) {
    throw new Error(`Plugin ${command.pluginId} installation conflicted`);
  }

  const instance = await writePluginConfigInstanceInTransaction(tx, {
    pluginId: command.pluginId,
    scopeType: command.scopeType,
    scopeId: command.scopeId,
    value: command.value,
    expectedSchemaVersion: definition.schemaVersion,
    expectedSchemaDigest: definition.schemaDigest,
    expectedRevision: null,
  });
  if (!instance) {
    throw new Error(
      `Plugin ${command.pluginId} configuration creation conflicted`,
    );
  }

  return {
    status: "installed",
    schemaDigest: definition.schemaDigest,
    schemaVersion: definition.schemaVersion,
  };
};

export const installPluginWithConfigIfAbsent: Command<
  InstallPluginWithConfigIfAbsentCommand,
  InstallPluginWithConfigIfAbsentResult
> = async (ctx, command) => {
  const result = await ctx.db.transaction(async (tx) =>
    installPluginWithConfigIfAbsentInTransaction(tx, command),
  );

  return { result, events: [] };
};
