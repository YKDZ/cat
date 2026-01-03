import {
  and,
  eq,
  DrizzleClient,
  pluginInstallation,
  pluginService,
} from "@cat/db";
import {
  PluginRegistry,
  type IPluginService,
  type PluginServiceMap,
} from "@cat/plugin-core";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
} from "@cat/shared/utils";
import path, { join, resolve } from "node:path";
import { cwd } from "node:process";

export const firstOrGivenService = async <T extends PluginServiceType>(
  drizzle: DrizzleClient,
  pluginRegistry: PluginRegistry,
  type: T,
  id?: number,
): Promise<
  | {
      id: number;
      service: PluginServiceMap[T];
    }
  | undefined
> => {
  if (id) {
    return {
      id,
      // oxlint-disable-next-line no-unsafe-type-assertion
      service: (await getServiceFromDBId(
        drizzle,
        pluginRegistry,
        id,
      )) as unknown as PluginServiceMap[T],
    };
  } else {
    const services = pluginRegistry.getPluginServices(type);

    if (services.length === 0) return undefined;

    const { record, service } = assertFirstNonNullish(
      pluginRegistry.getPluginServices(type),
    );
    const id = await pluginRegistry.getPluginServiceDbId(
      drizzle,
      record.pluginId,
      record.type,
      record.id,
    );

    return {
      id,
      service,
    };
  }
};

/**
 * 不涉及插件函数调用，可以在事务中安全调用
 */
export const getServiceFromDBId = async <T extends IPluginService>(
  drizzle: DrizzleClient,
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
    "local-storage-provider",
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
