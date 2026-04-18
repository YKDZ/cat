import { eq, pluginConfigInstance } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared/schema/json";
import * as z from "zod";

import type { Command } from "@/types";

export const UpdatePluginConfigInstanceValueCommandSchema = z.object({
  instanceId: z.int(),
  value: nonNullSafeZDotJson,
});

export type UpdatePluginConfigInstanceValueCommand = z.infer<
  typeof UpdatePluginConfigInstanceValueCommandSchema
>;

export const updatePluginConfigInstanceValue: Command<
  UpdatePluginConfigInstanceValueCommand
> = async (ctx, command) => {
  await ctx.db
    .update(pluginConfigInstance)
    .set({ value: command.value })
    .where(eq(pluginConfigInstance.id, command.instanceId));

  return { result: undefined, events: [] };
};
