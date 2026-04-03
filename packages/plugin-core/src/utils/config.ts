import type { DbHandle } from "@cat/domain";
import type { ScopeType } from "@cat/shared/schema/enum";
import type { JSONType } from "@cat/shared/schema/json";

import { executeQuery, getPluginConfigInstance } from "@cat/domain";

export const getPluginConfig = async (
  drizzle: DbHandle,
  pluginId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<JSONType> => {
  const config = await getConfigInstance(drizzle, pluginId, scopeType, scopeId);
  // FUTURE: scope config inheritance
  return config;
};

export const getConfigInstance = async (
  drizzle: DbHandle,
  pluginId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<JSONType> => {
  const data = await executeQuery({ db: drizzle }, getPluginConfigInstance, {
    pluginId,
    scopeType,
    scopeId,
  });

  if (!data) return {};

  return data.value as JSONType;
};
