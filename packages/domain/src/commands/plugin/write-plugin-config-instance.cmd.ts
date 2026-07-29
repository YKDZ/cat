import {
  and,
  eq,
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
  sql,
} from "@cat/db";
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

export const WritePluginConfigInstanceCommandSchema = z.object({
  pluginId: z.string(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
  creatorId: z.uuidv4().nullable().optional(),
  value: nonNullSafeZDotJson,
  expectedSchemaVersion: z.string().min(1),
  expectedSchemaDigest: z.string().length(64),
  expectedRevision: z.int().positive().nullable().optional(),
});

export type WritePluginConfigInstanceCommand = {
  pluginId: string;
  scopeType: ScopeType;
  scopeId: string;
  creatorId?: string | null | undefined;
  value: NonNullJSONType;
  expectedSchemaVersion: string;
  expectedSchemaDigest: string;
  expectedRevision?: number | null | undefined;
};

export const writePluginConfigInstanceInTransaction = async (
  tx: DbHandle,
  command: WritePluginConfigInstanceCommand,
): Promise<typeof pluginConfigInstance.$inferSelect | null> => {
  await lockPluginConfigDefinition(tx, command.pluginId);
  const [definition] = await tx
    .select({
      id: pluginConfig.id,
      schema: pluginConfig.schema,
      schemaVersion: pluginConfig.schemaVersion,
      schemaDigest: pluginConfig.schemaDigest,
      isAvailable: pluginConfig.isAvailable,
    })
    .from(pluginConfig)
    .where(eq(pluginConfig.pluginId, command.pluginId))
    .limit(1);
  if (
    !definition ||
    !definition.isAvailable ||
    definition.schemaVersion !== command.expectedSchemaVersion ||
    definition.schemaDigest !== command.expectedSchemaDigest
  ) {
    return null;
  }

  assertPluginConfigValueMatchesSchema(definition.schema, command.value);
  const [installation] = await tx
    .select({ id: pluginInstallation.id })
    .from(pluginInstallation)
    .where(
      and(
        eq(pluginInstallation.pluginId, command.pluginId),
        eq(pluginInstallation.scopeType, command.scopeType),
        eq(pluginInstallation.scopeId, command.scopeId),
      ),
    )
    .limit(1);
  if (!installation) return null;

  if (
    command.expectedRevision === null ||
    command.expectedRevision === undefined
  ) {
    const created = await tx
      .insert(pluginConfigInstance)
      .values({
        value: command.value,
        creatorId: command.creatorId ?? null,
        configId: definition.id,
        pluginInstallationId: installation.id,
        appliedVersion: definition.schemaVersion,
        revision: 1,
      })
      .onConflictDoNothing()
      .returning();
    return created[0] ?? null;
  }

  const updated = await tx
    .update(pluginConfigInstance)
    .set({
      value: command.value,
      revision: sql`${pluginConfigInstance.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pluginConfigInstance.configId, definition.id),
        eq(pluginConfigInstance.pluginInstallationId, installation.id),
        eq(pluginConfigInstance.appliedVersion, definition.schemaVersion),
        eq(pluginConfigInstance.revision, command.expectedRevision),
      ),
    )
    .returning();

  return updated[0] ?? null;
};

export const writePluginConfigInstance: Command<
  WritePluginConfigInstanceCommand,
  typeof pluginConfigInstance.$inferSelect | null
> = async (ctx, command) => {
  const result = await ctx.db.transaction(async (tx) =>
    writePluginConfigInstanceInTransaction(tx, command),
  );

  return { result, events: [] };
};
