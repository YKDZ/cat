import type { DrizzleClient } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { and, eq, pluginInstallation } from "@cat/db";

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
    await drizzle
      .select({
        pluginId: pluginInstallation.pluginId,
      })
      .from(pluginInstallation)
      .where(
        and(
          eq(pluginInstallation.scopeType, "GLOBAL"),
          eq(pluginInstallation.scopeId, ""),
        ),
      )
  ).map((i) => i.pluginId);

  const needToBeInstalled = localPlugins.filter(
    (p) => !installedPlugins.includes(p),
  );

  for (const pluginId of needToBeInstalled) {
    await pluginRegistry.installPlugin(drizzle, pluginId);
  }
};
