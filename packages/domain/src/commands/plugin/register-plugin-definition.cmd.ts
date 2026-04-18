import { plugin, pluginConfig } from "@cat/db";
import { _JSONSchemaSchema, JSONSchemaSchema } from "@cat/shared/schema/json";
import * as z from "zod";

import type { Command } from "@/types";

export const RegisterPluginDefinitionCommandSchema = z.object({
  pluginId: z.string(),
  version: z.string(),
  name: z.string(),
  entry: z.string(),
  overview: z.string(),
  iconUrl: z.string().nullable(),
  configSchema: JSONSchemaSchema.optional(),
});

export type RegisterPluginDefinitionCommand = z.infer<
  typeof RegisterPluginDefinitionCommandSchema
>;

export const registerPluginDefinition: Command<
  RegisterPluginDefinitionCommand
> = async (ctx, command) => {
  await ctx.db.transaction(async (tx) => {
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

    if (command.configSchema !== undefined) {
      const schema = _JSONSchemaSchema.parse(command.configSchema);
      await tx
        .insert(pluginConfig)
        .values([{ pluginId: command.pluginId, schema }])
        .onConflictDoUpdate({
          target: [pluginConfig.pluginId],
          set: { schema },
        });
    }
  });

  return { result: void 0, events: [] };
};
