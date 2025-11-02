import {
  eq,
  OverallDrizzleClient,
  pluginInstallation,
  pluginService,
} from "@cat/db";
import { PluginRegistry, type IPluginService } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";

export const getServiceFromDBId = async <T extends IPluginService>(
  drizzle: OverallDrizzleClient,
  pluginRegistry: PluginRegistry,
  id: number,
): Promise<T> => {
  const dbAdvisor = assertSingleNonNullish(
    await drizzle
      .select({
        serviceId: pluginService.serviceId,
        serviceType: pluginService.serviceType,
        pluginId: pluginInstallation.pluginId,
      })
      .from(pluginService)
      .innerJoin(
        pluginInstallation,
        eq(pluginService.pluginInstallationId, pluginInstallation.id),
      )
      .where(eq(pluginService.id, id))
      .limit(1),
    `Service ${id} not found`,
  );

  if (!dbAdvisor) throw new Error(`Service ${id} not found`);

  const { service } = (await pluginRegistry.getPluginService(
    drizzle,
    dbAdvisor.pluginId,
    dbAdvisor.serviceType,
    dbAdvisor.serviceId,
  ))!;

  if (!service) throw new Error(`Service ${id} not found`);

  // oxlint-disable-next-line no-unsafe-type-assertion
  return service as unknown as T;
};
