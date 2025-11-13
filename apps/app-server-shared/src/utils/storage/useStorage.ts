import type { DrizzleClient, OverallDrizzleClient } from "@cat/db";
import type { StorageProvider } from "@cat/plugin-core";
import { PluginRegistry } from "@cat/plugin-core";
import { getServiceFromDBId } from "../plugin";
import type { ScopeType } from "@cat/shared/schema/drizzle/enum";

export const useStorage = async (
  drizzle: OverallDrizzleClient,
  pluginId: string,
  serviceId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<{
  provider: StorageProvider;
  id: number;
}> => {
  const registry = PluginRegistry.get(scopeType, scopeId);
  const storage = registry.getPluginService(
    pluginId,
    "STORAGE_PROVIDER",
    serviceId,
  )!;
  const id = await registry.getPluginServiceDbId(drizzle, {
    pluginId,
    type: "STORAGE_PROVIDER",
    id: serviceId,
  });

  if (!storage)
    throw new Error(
      `Storage provider ${pluginId}:${serviceId} does not exists found`,
    );

  const installation = await drizzle.query.pluginInstallation.findFirst({
    where: (installation, { and, eq }) =>
      and(
        eq(installation.pluginId, pluginId),
        eq(installation.scopeId, scopeId),
        eq(installation.scopeType, scopeType),
      ),
    columns: {
      id: true,
    },
  });

  if (!installation)
    throw new Error(
      `Storage provider ${pluginId}:${serviceId} does not installed in scope ${scopeType} ${scopeId}`,
    );

  return {
    provider: storage,
    id,
  };
};

export const useStorageByDBId = async (
  drizzle: DrizzleClient,
  pluginRegistry: PluginRegistry,
  id: number,
): Promise<StorageProvider> => {
  const service = await getServiceFromDBId<StorageProvider>(
    drizzle,
    pluginRegistry,
    id,
  );

  return service;
};
