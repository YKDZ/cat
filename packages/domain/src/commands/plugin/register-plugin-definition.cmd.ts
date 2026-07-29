import { eq, plugin, pluginConfig } from "@cat/db/drizzle";
import { _JSONSchemaSchema, JSONSchemaSchema } from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

import {
  getPluginConfigSchemaDigest,
  LegacyUnverifiedPluginConfigVersion,
  lockPluginConfigDefinition,
} from "./plugin-config-contract.ts";

export const RegisterPluginDefinitionCommandSchema = z
  .object({
    pluginId: z.string(),
    version: z.string(),
    name: z.string(),
    entry: z.string(),
    overview: z.string(),
    iconUrl: z.string().nullable(),
    configSchema: JSONSchemaSchema.optional(),
    configVersion: z
      .string()
      .min(1)
      .refine((version) => version !== LegacyUnverifiedPluginConfigVersion)
      .optional(),
  })
  .superRefine((command, context) => {
    if (
      command.configSchema !== undefined &&
      command.configVersion === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "configVersion is required when configSchema is declared",
        path: ["configVersion"],
      });
    }
  });

export type RegisterPluginDefinitionCommand = z.infer<
  typeof RegisterPluginDefinitionCommandSchema
>;

export const registerPluginDefinition: Command<
  RegisterPluginDefinitionCommand
> = async (ctx, command) => {
  await ctx.db.transaction(async (tx) => {
    await lockPluginConfigDefinition(tx, command.pluginId);
    await tx
      .insert(plugin)
      .values([
        {
          id: command.pluginId,
          version: command.version,
          name: command.name,
          entry: command.entry,
          overview: command.overview,
          iconUrl: command.iconUrl,
        },
      ])
      .onConflictDoUpdate({
        target: plugin.id,
        set: {
          name: command.name,
          version: command.version,
          entry: command.entry,
          overview: command.overview,
          iconUrl: command.iconUrl,
        },
      });

    if (command.configSchema === undefined) {
      // Discovery must not delete operator-owned configuration just because a
      // manifest temporarily withdraws its schema.
      await tx
        .update(pluginConfig)
        .set({ isAvailable: false, updatedAt: new Date() })
        .where(eq(pluginConfig.pluginId, command.pluginId));
    } else {
      const schema = _JSONSchemaSchema.parse(command.configSchema);
      const schemaDigest = getPluginConfigSchemaDigest(schema);
      const configVersion = command.configVersion;
      if (!configVersion) {
        throw new Error(
          "configVersion is required when configSchema is declared",
        );
      }
      const existing = await tx
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
      const definition = existing[0];

      if (!definition) {
        await tx.insert(pluginConfig).values({
          pluginId: command.pluginId,
          schema,
          schemaVersion: configVersion,
          schemaDigest,
          isAvailable: true,
        });
      } else if (definition.schemaVersion === configVersion) {
        if (definition.schemaDigest === "") {
          if (getPluginConfigSchemaDigest(definition.schema) !== schemaDigest) {
            throw new Error(
              `Plugin ${command.pluginId} changed configuration schema digest without a version change`,
            );
          }
          await tx
            .update(pluginConfig)
            .set({ schemaDigest, isAvailable: true, updatedAt: new Date() })
            .where(eq(pluginConfig.id, definition.id));
        } else if (definition.schemaDigest !== schemaDigest) {
          throw new Error(
            `Plugin ${command.pluginId} changed configuration schema digest without a version change`,
          );
        } else if (!definition.isAvailable) {
          await tx
            .update(pluginConfig)
            .set({ isAvailable: true, updatedAt: new Date() })
            .where(eq(pluginConfig.id, definition.id));
        }
      } else {
        await tx
          .update(pluginConfig)
          .set({
            schema,
            schemaVersion: configVersion,
            schemaDigest,
            isAvailable: true,
            updatedAt: new Date(),
          })
          .where(eq(pluginConfig.id, definition.id));
      }
    }
  });

  return { result: void 0, events: [] };
};
