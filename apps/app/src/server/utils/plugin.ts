import type { OverallPrismaClient, PrismaClient } from "@cat/db";
import { PluginRegistry, type IPluginService } from "@cat/plugin-core";

export const getServiceFromDBId = async <T extends IPluginService>(
  prisma: OverallPrismaClient,
  pluginRegistry: PluginRegistry,
  id: number,
) => {
  const dbAdvisor = await prisma.pluginService.findUnique({
    where: { id },
    select: {
      serviceId: true,
      serviceType: true,
      PluginInstallation: {
        select: {
          pluginId: true,
        },
      },
    },
  });

  if (!dbAdvisor) throw new Error(`Service ${id} not found`);

  const { service } = (await pluginRegistry.getPluginService(
    prisma,
    dbAdvisor.PluginInstallation.pluginId,
    dbAdvisor.serviceType,
    dbAdvisor.serviceId,
  ))!;

  if (!service) throw new Error(`Service ${id} not found`);

  return service as unknown as T;
};

export const importLocalPlugins = async (
  prisma: PrismaClient,
): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const existPluginIds: string[] = [];

    existPluginIds.push(
      ...(
        await tx.plugin.findMany({
          select: {
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
  prisma: PrismaClient,
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
    await prisma.pluginInstallation.findMany({
      where: {
        scopeType: "GLOBAL",
        scopeId: "",
      },
      select: { pluginId: true },
    })
  ).map((i) => i.pluginId);

  const needToBeInstalled = localPlugins.filter(
    (p) => !installedPlugins.includes(p),
  );

  for (const pluginId of needToBeInstalled) {
    await pluginRegistry.installPlugin(prisma, pluginId);
  }
};
