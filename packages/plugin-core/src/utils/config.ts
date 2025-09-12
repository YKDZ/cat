import type { OverallPrismaClient, ScopeType } from "@cat/db";
import type { JSONType } from "@cat/shared/schema/json";
import { merge } from "lodash-es";
import z from "zod";

export const getPluginConfig = async (
  prisma: OverallPrismaClient,
  pluginId: string,
  options?: {
    projectId?: string;
    userId?: string;
  },
): Promise<JSONType> => {
  const global = await getConfigInstance(prisma, pluginId, "GLOBAL", "");

  const project = await getConfigInstance(
    prisma,
    pluginId,
    "PROJECT",
    options?.projectId,
  );

  const user = await getConfigInstance(
    prisma,
    pluginId,
    "USER",
    options?.userId,
  );

  // TODO 继承方案应该更可控
  return merge(user, project, global);
};

export const getConfigInstance = async (
  prisma: OverallPrismaClient,
  pluginId: string,
  scopeType: ScopeType,
  scopeId?: string,
): Promise<JSONType> => {
  if (scopeId === undefined) return {};

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
