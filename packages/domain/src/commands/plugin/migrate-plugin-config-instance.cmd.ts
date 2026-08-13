import {
  and,
  eq,
  pluginConfig,
  pluginConfigInstance,
  pluginService,
  sql,
} from "@cat/db";
import {
  nonNullSafeZDotJson,
  stableSerializeLanguageAnalysis,
  type NonNullJSONType,
} from "@cat/shared";
import * as z from "zod";

import { invalidateRecallDerivationDemands } from "#/commands/recall-derivation/invalidate-recall-derivation-demands.ts";
import type { Command } from "#/types.ts";

import {
  assertPluginConfigValueMatchesSchema,
  getPluginConfigSchemaDigest,
  lockPluginConfigDefinition,
} from "./plugin-config-contract.ts";

export const MigratePluginConfigInstanceCommandSchema = z.object({
  instanceId: z.int(),
  expectedRevision: z.int().positive(),
  fromVersion: z.string().min(1),
  expectedSchemaDigest: z.string().length(64),
  value: nonNullSafeZDotJson,
});

export type MigratePluginConfigInstanceCommand = {
  instanceId: number;
  expectedRevision: number;
  fromVersion: string;
  expectedSchemaDigest: string;
  value: NonNullJSONType;
};

/** Explicitly validate and migrate one stale configuration instance to its current definition. */
export const migratePluginConfigInstance: Command<
  MigratePluginConfigInstanceCommand,
  typeof pluginConfigInstance.$inferSelect | null
> = async (ctx, command) => {
  const result = await ctx.db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ pluginId: pluginConfig.pluginId })
      .from(pluginConfigInstance)
      .innerJoin(
        pluginConfig,
        eq(pluginConfigInstance.configId, pluginConfig.id),
      )
      .where(eq(pluginConfigInstance.id, command.instanceId))
      .limit(1);
    if (!candidate) return null;

    await lockPluginConfigDefinition(tx, candidate.pluginId);
    const [current] = await tx
      .select({
        configId: pluginConfig.id,
        schema: pluginConfig.schema,
        schemaVersion: pluginConfig.schemaVersion,
        schemaDigest: pluginConfig.schemaDigest,
        isAvailable: pluginConfig.isAvailable,
        appliedVersion: pluginConfigInstance.appliedVersion,
        pluginInstallationId: pluginConfigInstance.pluginInstallationId,
        value: pluginConfigInstance.value,
      })
      .from(pluginConfigInstance)
      .innerJoin(
        pluginConfig,
        eq(pluginConfigInstance.configId, pluginConfig.id),
      )
      .where(eq(pluginConfigInstance.id, command.instanceId))
      .limit(1);

    if (
      !current ||
      !current.isAvailable ||
      current.appliedVersion !== command.fromVersion ||
      current.appliedVersion === current.schemaVersion ||
      current.schemaDigest !== command.expectedSchemaDigest ||
      getPluginConfigSchemaDigest(current.schema) !==
        command.expectedSchemaDigest
    ) {
      return null;
    }

    assertPluginConfigValueMatchesSchema(current.schema, command.value);
    const migrated = await tx
      .update(pluginConfigInstance)
      .set({
        value: command.value,
        appliedVersion: current.schemaVersion,
        revision: sql`${pluginConfigInstance.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pluginConfigInstance.id, command.instanceId),
          eq(pluginConfigInstance.configId, current.configId),
          eq(pluginConfigInstance.appliedVersion, command.fromVersion),
          eq(pluginConfigInstance.revision, command.expectedRevision),
        ),
      )
      .returning();

    if (
      migrated[0] &&
      stableSerializeLanguageAnalysis(current.value) !==
        stableSerializeLanguageAnalysis(command.value)
    ) {
      const [tokenizer] = await tx
        .select({ id: pluginService.id })
        .from(pluginService)
        .where(
          and(
            eq(
              pluginService.pluginInstallationId,
              current.pluginInstallationId,
            ),
            eq(pluginService.serviceType, "TOKENIZER"),
          ),
        )
        .limit(1);
      if (tokenizer) await invalidateRecallDerivationDemands(tx);
    }

    return migrated[0] ?? null;
  });

  return { result, events: [] };
};
