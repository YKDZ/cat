import {
  DrizzleClient,
  eq,
  OverallDrizzleClient,
  pluginInstallation,
  pluginService,
} from "@cat/db";
import { PluginRegistry, type IPluginService } from "@cat/plugin-core";
import { getSingle } from "@cat/shared/utils";

export const getServiceFromDBId = async <T extends IPluginService>(
  drizzle: OverallDrizzleClient,
  pluginRegistry: PluginRegistry,
  id: number,
) => {
  const dbAdvisor = getSingle(
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
  );

  if (!dbAdvisor) throw new Error(`Service ${id} not found`);

  const { service } = (await pluginRegistry.getPluginService(
    drizzle,
    dbAdvisor.pluginId,
    dbAdvisor.serviceType,
    dbAdvisor.serviceId,
  ))!;

  if (!service) throw new Error(`Service ${id} not found`);

  return service as unknown as T;
};

export const importLocalPlugins = async (
  drizzle: DrizzleClient,
): Promise<void> => {
  await drizzle.transaction(async (tx) => {
    const existPluginIds: string[] = [];

    existPluginIds.push(
      ...(
        await tx.query.plugin.findMany({
          columns: {
            id: true,
          },
        })
      ).map((plugin) => plugin.id),
    );

    for (const id of (await PluginRegistry.getPluginIdInLocalPlugins()).filter(
      (id) => !existPluginIds.includes(id),
    )) {
      await PluginRegistry.importPlugin(tx, id);
    }
  });
};

export const installDefaultPlugins = async (
  drizzle: DrizzleClient,
  pluginRegistry: PluginRegistry,
): Promise<void> => {
  const localPlugins = [
    "email-password-auth-provider",
    "es-term-service",
    "json-file-handler",
    "libretranslate-advisor",
    "ollama-vectorizer",
    "yaml-file-handler",
    "s3-storage-provider",
  ];

  const installedPlugins = (
    await drizzle.query.pluginInstallation.findMany({
      where: (installation, { and, eq }) =>
        and(eq(installation.scopeType, "GLOBAL"), eq(installation.scopeId, "")),
      columns: { pluginId: true },
    })
  ).map((i) => i.pluginId);

  const needToBeInstalled = localPlugins.filter(
    (p) => !installedPlugins.includes(p),
  );

  for (const pluginId of needToBeInstalled) {
    await pluginRegistry.installPlugin(drizzle, pluginId);
  }
};
