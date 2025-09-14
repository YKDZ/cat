import type { OverallPrismaClient, ScopeType } from "@cat/db";
import type { StorageProvider } from "@cat/plugin-core";
import { PluginRegistry } from "@cat/plugin-core";

export const useStorage = async (
  prisma: OverallPrismaClient,
  storageServiceId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<{
  provider: StorageProvider;
  pluginId: string;
  id: number;
}> => {
  const storage = (
    await PluginRegistry.get().getStorageProviders(prisma)
  ).filter(({ provider }) => provider.getId() === storageServiceId)[0];

  if (!storage)
    throw new Error(
      `Storage provider ${storageServiceId} does not exists found`,
    );

  const installation = await prisma.pluginInstallation.findUnique({
    where: {
      scopeId_scopeType_pluginId: {
        scopeId,
        scopeType,
        pluginId: storage.pluginId,
      },
    },
  });

  if (!installation)
    throw new Error(
      `Storage provider ${storageServiceId} does not installed in scope ${scopeType} ${scopeId}`,
    );

  const dbStorage = await prisma.storageProvider.findUnique({
    where: {
      serviceId_pluginInstallationId: {
        serviceId: storageServiceId,
        pluginInstallationId: installation.id,
      },
    },
  });

  if (!dbStorage)
    throw new Error(
      `Storage provider ${storageServiceId} does not exists in db. This should not happen.`,
    );

  return {
    provider: storage.provider,
    pluginId: storage.pluginId,
    id: dbStorage.id,
  };
};
