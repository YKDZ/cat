import type { PluginConfigInstatnceScopeType, PrismaClient } from "@cat/db";
import { merge } from "lodash-es";
import z from "zod";

export const getMergedPluginConfigs = async (
  prisma: PrismaClient,
  pluginId: string,
  options?: {
    projectId?: string;
    userId?: string;
  },
) => {
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

  return merge(user, project, global);
};

export const getConfigInstance = async (
  prisma: PrismaClient,
  pluginId: string,
  scopeType: PluginConfigInstatnceScopeType,
  scopeId?: string,
) => {
  if (!scopeType || !scopeId) return {};

  const data = await prisma.pluginConfigInstance.findMany({
    where: {
      scopeType: "GLOBAL",
      scopeId: "",
      Config: {
        pluginId,
      },
    },
    select: {
      Config: {
        select: {
          key: true,
        },
      },
      value: true,
    },
  });

  if (!data) return {};

  return z
    .record(z.string(), z.json())
    .parse(
      Object.fromEntries(data.map((item) => [item.Config.key, item.value])),
    );
};
