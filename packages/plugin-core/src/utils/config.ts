import type { DbHandle } from "@cat/domain";
import {
  executeQuery,
  getPluginConfig as getPluginConfigDefinition,
  getPluginConfigInstance,
} from "@cat/domain";
import { assertPluginConfigValueMatchesSchema } from "@cat/domain";
import type { ScopeType } from "@cat/shared";
import type { JSONType } from "@cat/shared";
import { _JSONSchemaSchema } from "@cat/shared";

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
  const [definition, data] = await Promise.all([
    executeQuery({ db: drizzle }, getPluginConfigDefinition, { pluginId }),
    executeQuery({ db: drizzle }, getPluginConfigInstance, {
      pluginId,
      scopeType,
      scopeId,
    }),
  ]);

  if (!definition || !definition.isAvailable) return {};
  if (!data) {
    throw new Error(
      `Plugin ${pluginId} requires an explicit configuration instance before activation`,
    );
  }
  if (data.appliedVersion !== definition.schemaVersion) {
    throw new Error(
      `Plugin ${pluginId} configuration requires an explicit schema migration before activation`,
    );
  }
  assertPluginConfigValueMatchesSchema(
    _JSONSchemaSchema.parse(definition.schema),
    data.value,
  );

  return data.value;
};
