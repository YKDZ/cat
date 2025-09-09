import { PrismaClient } from "@cat/db";
import { logger } from "@cat/shared";
import { PluginRegistry } from "@cat/plugin-core";
import { importPlugin, installPlugin } from "./plugin";

export const importLocalPlugins = async (prisma: PrismaClient) => {
  const existPluginIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    existPluginIds.push(
      ...(
        await tx.plugin.findMany({
          select: {
            id: true,
          },
        })
      ).map((plugin) => plugin.id),
    );

    await Promise.all(
      (await PluginRegistry.get().getPluginIdInLocalPlugins())
        .filter((id) => !existPluginIds.includes(id))
        .map(async (id) => {
          await importPlugin(tx, id);
        }),
    );
  });
};

export const installDefaultPlugins = async (prisma: PrismaClient) => {
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
    logger.info("SERVER", {
      msg: `About to install default plugin ${pluginId} to global scope...`,
    });
    await installPlugin(prisma, pluginId, "GLOBAL", "");
  }
};
