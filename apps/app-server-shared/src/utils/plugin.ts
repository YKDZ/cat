import {
  and,
  eq,
  OverallDrizzleClient,
  plugin,
  pluginInstallation,
  pluginService,
  type DrizzleClient,
} from "@cat/db";
import { PluginRegistry, type IPluginService } from "@cat/plugin-core";
import { assertSingleNonNullish } from "@cat/shared/utils";
import path, { join, resolve } from "node:path";
import { cwd } from "node:process";

export const getServiceFromDBId = async <T extends IPluginService>(
  drizzle: OverallDrizzleClient,
  pluginRegistry: PluginRegistry,
  id: number,
): Promise<T> => {
  const dbService = assertSingleNonNullish(
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

  const service = pluginRegistry.getPluginService(
    dbService.pluginId,
    dbService.serviceType,
    dbService.serviceId,
  )!;

  // oxlint-disable-next-line no-unsafe-type-assertion
  return service as unknown as T;
};

export const importLocalPlugins = async (
  drizzle: DrizzleClient,
): Promise<void> => {
  await drizzle.transaction(async (tx) => {
    const existPluginIds: string[] = (
      await tx
        .select({
          id: plugin.id,
        })
        .from(plugin)
    ).map((plugin) => plugin.id);

    await Promise.all(
      (await PluginRegistry.getPluginIdInLocalPlugins())
        .filter((id) => !existPluginIds.includes(id))
        .map(async (id) => {
          await PluginRegistry.importPlugin(tx, id);
        }),
    );
  });
};

export const installDefaultPlugins = async (
  drizzle: DrizzleClient,
  pluginRegistry: PluginRegistry,
): Promise<void> => {
  const localPlugins = [
    "password-auth-provider",
    "openai-term-extractor",
    "json-file-handler",
    "libretranslate-advisor",
    "openai-vectorizer",
    "yaml-file-handler",
    "s3-storage-provider",
    "pgvector-storage",
    "markdown-file-handler",
    "tiny-widget",
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

  await Promise.all(
    needToBeInstalled.map(async (pluginId) => {
      await pluginRegistry.installPlugin(drizzle, pluginId);
    }),
  );
};

const PLUGIN_ROOT = join(cwd(), "plugins");

/**
 * 找到指定组件在本地插件目录中的位置
 */
export const resolvePluginComponentPath = (
  pluginId: string,
  componentName: string,
): string => {
  const component = PluginRegistry.get("GLOBAL", "")
    .getComponents(pluginId)
    .find((component) => component.name === componentName);
  if (!component) {
    throw new Error("missing component");
  }

  const pluginRoot = resolve(PLUGIN_ROOT, pluginId);
  const targetPath = resolve(pluginRoot, component.url);

  if (!targetPath.startsWith(pluginRoot + path.sep)) {
    throw new Error("invalid path");
  }

  if (!/\.(m?js)$/.test(targetPath)) {
    throw new Error("only js modules allowed");
  }

  return targetPath;
};

/**
 * 找到指定组件在本地插件目录中的位置
 */
export const resolvePluginComponentSkeletonPath = (
  pluginId: string,
  componentName: string,
): string => {
  const component = PluginRegistry.get("GLOBAL", "")
    .getComponents(pluginId)
    .find((component) => component.name === componentName);
  if (!component || !component.skeleton) {
    throw new Error("missing skeleton of component");
  }

  const pluginRoot = resolve(PLUGIN_ROOT, pluginId);
  const targetPath = resolve(pluginRoot, component.skeleton);

  if (!targetPath.startsWith(pluginRoot + path.sep)) {
    throw new Error("invalid path");
  }

  if (!/\.(m?js)$/.test(targetPath)) {
    throw new Error("only js modules allowed");
  }

  return targetPath;
};
