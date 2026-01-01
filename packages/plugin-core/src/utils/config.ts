import {
  and,
  eq,
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
  type DrizzleTransaction,
} from "@cat/db";
import type { ScopeType } from "@cat/shared/schema/drizzle/enum";
import type { JSONType } from "@cat/shared/schema/json";
import { assertSingleOrNull } from "@cat/shared/utils";

export const getPluginConfig = async (
  drizzle: DrizzleTransaction,
  pluginId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<JSONType> => {
  const config = await getConfigInstance(drizzle, pluginId, scopeType, scopeId);
  // TODO 继承
  return config;
};

export const getConfigInstance = async (
  drizzle: DrizzleTransaction,
  pluginId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<JSONType> => {
  const installation = assertSingleOrNull(
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
  );

  if (!installation) return {};

  const config = assertSingleOrNull(
    await drizzle
      .select({
        id: pluginConfig.id,
      })
      .from(pluginConfig)
      .where(eq(pluginConfig.pluginId, pluginId)),
  );

  if (!config) return {};

  const data = assertSingleOrNull(
    await drizzle
      .select({
        value: pluginConfigInstance.value,
      })
      .from(pluginConfigInstance)
      .where(
        and(
          eq(pluginConfigInstance.configId, config.id),
          eq(pluginConfigInstance.pluginInstallationId, installation.id),
        ),
      ),
  );

  if (!data) return {};

  return data.value;
};
