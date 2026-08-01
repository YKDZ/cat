import path, { join, resolve } from "node:path";
import { cwd } from "node:process";

import {
  PluginManager,
  type PluginServiceMap,
  type ServiceImplementationResolution,
} from "@cat/plugin-core";
import type {
  PluginServiceType,
  ServiceImplementationReference,
} from "@cat/shared";
import { assertFirstNonNullish } from "@cat/shared";

export class ServiceImplementationResolutionError<
  T extends PluginServiceType,
> extends Error {
  public readonly resolution: Exclude<
    ServiceImplementationResolution<T>,
    { kind: "RESOLVED" }
  >;

  public constructor(
    resolution: Exclude<
      ServiceImplementationResolution<T>,
      { kind: "RESOLVED" }
    >,
  ) {
    super(`Cannot resolve service implementation: ${resolution.kind}`);
    this.name = "ServiceImplementationResolutionError";
    this.resolution = resolution;
  }
}

/** Explicit policy seam for callers that intentionally select the first service. */
export const selectFirstServiceImplementation = <T extends PluginServiceType>(
  pluginManager: PluginManager,
  type: T,
):
  | {
      reference: ServiceImplementationReference;
      service: PluginServiceMap[T];
    }
  | undefined => {
  const services = pluginManager.getServices(type);

  if (services.length === 0) return undefined;

  const registered = assertFirstNonNullish(services);

  return {
    reference: pluginManager.createServiceImplementationReference(registered),
    // PluginManager's type-indexed registry boundary is the only cast needed.
    // oxlint-disable-next-line no-unsafe-type-assertion
    service: registered.service as unknown as PluginServiceMap[T],
  };
};

/**
 * 不涉及插件函数调用，可以在事务中安全调用
 */
export const resolveServiceImplementation = <T extends PluginServiceType>(
  pluginManager: PluginManager,
  reference: ServiceImplementationReference,
  expectedServiceType: T,
): PluginServiceMap[T] => {
  const resolution = pluginManager.resolveServiceImplementationReference(
    reference,
    expectedServiceType,
  );
  if (resolution.kind !== "RESOLVED") {
    throw new ServiceImplementationResolutionError(resolution);
  }

  return resolution.service.service;
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
