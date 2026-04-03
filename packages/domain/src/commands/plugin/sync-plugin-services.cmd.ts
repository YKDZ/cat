import { pluginService } from "@cat/db";
import { PluginServiceTypeSchema } from "@cat/shared/schema/enum";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const SyncPluginServicesCommandSchema = z.object({
  pluginInstallationId: z.int(),
  services: z.array(
    z.object({
      serviceId: z.string(),
      serviceType: PluginServiceTypeSchema,
    }),
  ),
});

export type SyncPluginServicesCommand = z.infer<
  typeof SyncPluginServicesCommandSchema
>;

export const syncPluginServices: Command<SyncPluginServicesCommand> = async (
  ctx,
  command,
) => {
  if (command.services.length === 0) return { result: void 0, events: [] };

  await ctx.db.insert(pluginService).values(
    command.services.map((svc) => ({
      serviceId: svc.serviceId,
      serviceType: svc.serviceType,
      pluginInstallationId: command.pluginInstallationId,
    })),
  );

  return { result: void 0, events: [] };
};
