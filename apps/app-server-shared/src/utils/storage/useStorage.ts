import { and, eq, pluginInstallation, type DrizzleClient } from "@cat/db";
import type { StorageProvider } from "@cat/plugin-core";
import { PluginRegistry } from "@cat/plugin-core";
import { getServiceFromDBId } from "../plugin";
import type { ScopeType } from "@cat/shared/schema/drizzle/enum";
import { assertSingleNonNullish } from "@cat/shared/utils";

export const useStorage = async (
  drizzle: DrizzleClient,
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
  const id = await registry.getPluginServiceDbId(drizzle, pluginId, serviceId);

  if (!storage)
    throw new Error(
      `Storage provider ${pluginId}:${serviceId} does not exists found`,
    );

  assertSingleNonNullish(
    await drizzle
      .select({
        id: pluginInstallation.id,
      })
      .from(pluginInstallation)
      .where(
        and(
          eq(pluginInstallation.pluginId, pluginId),
          eq(pluginInstallation.scopeId, scopeId),
          eq(pluginInstallation.scopeType, scopeType),
        ),
      ),
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
