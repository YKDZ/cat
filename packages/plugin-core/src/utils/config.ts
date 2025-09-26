import type { OverallDrizzleClient, ScopeType } from "@cat/db";
import type { JSONType } from "@cat/shared/schema/json";
import * as z from "zod/v4";

export const getPluginConfig = async (
  drizzle: OverallDrizzleClient,
  pluginId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<JSONType> => {
  const config = await getConfigInstance(drizzle, pluginId, scopeType, scopeId);

  // TODO 继承呢
  return config;
};

export const getConfigInstance = async (
  drizzle: OverallDrizzleClient,
  pluginId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<JSONType> => {
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

  if (!installation) return {};

  const config = await drizzle.query.pluginConfig.findFirst({
    where: (config, { eq }) => eq(config.pluginId, pluginId),
    columns: {
      id: true,
    },
  });

  if (!config) return {};

  const data = await drizzle.query.pluginConfigInstance.findFirst({
    where: (instance, { and, eq }) =>
      and(
        eq(instance.configId, config.id),
        eq(instance.pluginInstallationId, installation.id),
      ),
    columns: {
      value: true,
    },
  });

  if (!data) return {};

  return z.json().parse(data.value);
};
