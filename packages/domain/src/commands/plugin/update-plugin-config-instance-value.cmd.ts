import { eq, pluginConfigInstance } from "@cat/db";
import { nonNullSafeZDotJson } from "@cat/shared";
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
    .set({ value: command.value, updatedAt: new Date() })
    .where(eq(pluginConfigInstance.id, command.instanceId));

  return { result: undefined, events: [] };
};
