import type { OverallPrismaClient, ScopeType } from "@cat/db";
import type { StorageProvider } from "@cat/plugin-core";
import { PluginRegistry } from "@cat/plugin-core";

export const useStorage = async (
  prisma: OverallPrismaClient,
  pluginId: string,
  serviceId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<{
  provider: StorageProvider;
  id: number;
}> => {
  const { id, service: storage } = (await PluginRegistry.get(
    scopeType,
    scopeId,
  ).getPluginService(prisma, pluginId, "STORAGE_PROVIDER", serviceId))!;

  if (!storage)
    throw new Error(
      `Storage provider ${pluginId}:${serviceId} does not exists found`,
    );

  const installation = await prisma.pluginInstallation.findUnique({
    where: {
      scopeId_scopeType_pluginId: {
        scopeId,
        scopeType,
        pluginId: pluginId,
      },
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
