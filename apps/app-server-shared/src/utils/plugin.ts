import { and, eq, DrizzleClient, pluginInstallation } from "@cat/db";
import {
  PluginManager,
  type IPluginService,
  type PluginServiceMap,
} from "@cat/plugin-core";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import { assertFirstNonNullish } from "@cat/shared/utils";
import path, { join, resolve } from "node:path";
import { cwd } from "node:process";

export const firstOrGivenService = <T extends PluginServiceType>(
  pluginManager: PluginManager,
  type: T,
  id?: number,
): { id: number; service: PluginServiceMap[T] } | undefined => {
  if (id) {
    return {
      id,
      // oxlint-disable-next-line no-unsafe-type-assertion
      service: getServiceFromDBId(
        pluginManager,
        id,
      ) as unknown as PluginServiceMap[T],
    };
  } else {
    const services = pluginManager.getServices(type);

    if (services.length === 0) return undefined;

    const { dbId, service } = assertFirstNonNullish(services);

    return {
      id: dbId,
      // oxlint-disable-next-line no-unsafe-type-assertion
      service: service as unknown as PluginServiceMap[T],
    };
  }
};

/**
 * 不涉及插件函数调用，可以在事务中安全调用
 */
export const getServiceFromDBId = <T extends IPluginService>(
  pluginManager: PluginManager,
  id: number,
): T => {
  const service = pluginManager
    .getAllServices()
    .find((service) => service.dbId === id);

  if (!service) throw new Error("Service not exists");

  // oxlint-disable-next-line no-unsafe-type-assertion
  return service?.service as unknown as T;
};

export const installDefaultPlugins = async (
  drizzle: DrizzleClient,
  pluginManager: PluginManager,
): Promise<void> => {
  const localPlugins = [
    "password-auth-provider",
    "openai-term-extractor",
    "json-file-handler",
    "libretranslate-advisor",
    "openai-vectorizer",
    "yaml-file-handler",
    "local-storage-provider",
    "pgvector-storage",
    "markdown-file-handler",
    "tiny-widget",
    "basic-tokenizer",
    "basic-qa-checker",
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
      await pluginManager.install(drizzle, pluginId);
    }),
  );
};

const PLUGIN_ROOT = join(cwd(), "plugins");

/**
 * 找到指定组件在本地插件目录中的位置
 */
export const resolvePluginComponentPath = (
  pluginManager: PluginManager,
  pluginId: string,
  componentName: string,
): string => {
  const component = pluginManager
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
