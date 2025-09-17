import type { OverallPrismaClient, ScopeType } from "@cat/db";
import type { JSONType } from "@cat/shared/schema/json";
import z from "zod";

export const getPluginConfig = async (
  prisma: OverallPrismaClient,
  pluginId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<JSONType> => {
  const config = await getConfigInstance(prisma, pluginId, scopeType, scopeId);

  // TODO 继承呢
  return config;
};

export const getConfigInstance = async (
  prisma: OverallPrismaClient,
  pluginId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<JSONType> => {
  const installation = await prisma.pluginInstallation.findUnique({
    where: {
      scopeId_scopeType_pluginId: {
        scopeId,
        scopeType,
        pluginId,
      },
    },
    select: {
      id: true,
    },
  });

  if (!installation) return {};

  const config = await prisma.pluginConfig.findUnique({
    where: {
      pluginId,
    },
    select: {
      id: true,
    },
  });

  if (!config) return {};

  const data = await prisma.pluginConfigInstance.findUnique({
    where: {
      pluginInstallationId_configId: {
        pluginInstallationId: installation.id,
        configId: config.id,
      },
    },
    select: {
      value: true,
    },
  });

  if (!data) return {};

  return z.json().parse(data.value);
};
