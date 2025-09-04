import type { OverallPrismaClient, ScopeType } from "@cat/db";
import { merge } from "lodash-es";
import z from "zod";

export const getPluginConfigs = async (
  prisma: OverallPrismaClient,
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

  // TODO 继承方案应该更可控
  return merge(user, project, global);
};

export const getConfigInstance = async (
  prisma: OverallPrismaClient,
  pluginId: string,
  scopeType: ScopeType,
  scopeId?: string,
) => {
  if (scopeId === undefined) return {};

  const data = await prisma.pluginConfigInstance.findMany({
    where: {
      Config: {
        pluginId,
      },
      PluginInstallation: {
        scopeType,
        scopeId: scopeId,
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
