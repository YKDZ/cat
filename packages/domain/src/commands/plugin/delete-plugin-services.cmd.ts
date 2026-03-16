import { inArray, pluginService } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const DeletePluginServicesCommandSchema = z.object({
  serviceDbIds: z.array(z.int()),
});

export type DeletePluginServicesCommand = z.infer<
  typeof DeletePluginServicesCommandSchema
>;

export const deletePluginServices: Command<
  DeletePluginServicesCommand,
  void
> = async (ctx, command) => {
  if (command.serviceDbIds.length === 0) return { result: void 0, events: [] };

  await ctx.db
    .delete(pluginService)
    .where(inArray(pluginService.id, command.serviceDbIds));

  return { result: void 0, events: [] };
};
