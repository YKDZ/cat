import { eq, pluginInstallation } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const UninstallPluginCommandSchema = z.object({
  installationId: z.int(),
});

export type UninstallPluginCommand = z.infer<
  typeof UninstallPluginCommandSchema
>;

export const uninstallPlugin: Command<UninstallPluginCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .delete(pluginInstallation)
    .where(eq(pluginInstallation.id, command.installationId));

  return { result: void 0, events: [] };
};
