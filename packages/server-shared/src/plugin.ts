import type { PluginServiceType } from "@cat/shared";

import {
  PluginManager,
  type IPluginService,
  type PluginServiceMap,
} from "@cat/plugin-core";
import { assertFirstNonNullish } from "@cat/shared";
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

const PLUGIN_ROOT = join(cwd(), "plugins");

/**
 * 找到指定组件在本地插件目录中的位置
 */
export const resolvePluginComponentPath = async (
  pluginManager: PluginManager,
  pluginId: string,
  componentName: string,
): Promise<string> => {
  const component = pluginManager
    .getComponents(pluginId)
    .find((component) => component.name === componentName);
  if (!component) {
    throw new Error("missing component");
  }

  const resolvedByLoader = await pluginManager
    .getLoader()
    .resolveAssetPath?.(pluginId, component.url);
  const pluginRoot = resolve(PLUGIN_ROOT, pluginId);
  const targetPath = resolvedByLoader ?? resolve(pluginRoot, component.url);

  if (!resolvedByLoader && !targetPath.startsWith(pluginRoot + path.sep)) {
    throw new Error("invalid path");
  }

  if (!/\.(m?js)$/.test(targetPath)) {
    throw new Error("only js modules allowed");
  }

  return targetPath;
};

export const initAllVectorStorage = async (
  pluginManager: PluginManager,
): Promise<void> => {
  const services = pluginManager.getServices("VECTOR_STORAGE");

  for (const serivce of services) {
    // oxlint-disable-next-line no-await-in-loop
    await serivce.service.init({
      // TODO 维度协调
      dimension: 1024,
    });
  }
};

export const resolvePluginManager = (
  maybePluginManager: unknown,
): PluginManager => {
  if (maybePluginManager instanceof PluginManager) {
    return maybePluginManager;
  }

  return PluginManager.get("GLOBAL", "");
};
