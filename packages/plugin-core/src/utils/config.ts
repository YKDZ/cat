import type { DbHandle } from "@cat/domain";
import {
  executeQuery,
  getPluginConfig as getPluginConfigDefinition,
  getPluginConfigInstance,
} from "@cat/domain";
import { assertPluginConfigValueMatchesSchema } from "@cat/domain";
import type { ScopeType } from "@cat/shared";
import type { JSONType } from "@cat/shared";
import {
  _JSONSchemaSchema,
  stableSerializeLanguageAnalysis,
} from "@cat/shared";

export type PluginRuntimeConfigurationSnapshot = Readonly<{
  semanticConfig: JSONType;
  configurationDigest: string;
  appliedVersion: string | null;
  schemaVersion: string | null;
  schemaDigest: string | null;
}>;

const freezeJson = (value: JSONType): JSONType => {
  const clone: JSONType = structuredClone(value);
  const freeze = (candidate: JSONType): JSONType => {
    if (candidate !== null && typeof candidate === "object") {
      for (const child of Object.values(candidate)) {
        freeze(child as JSONType);
      }
      Object.freeze(candidate);
    }
    return candidate;
  };
  return freeze(clone);
};

const configurationDigest = async (input: {
  semanticConfig: JSONType;
  appliedVersion: string | null;
  schemaVersion: string | null;
  schemaDigest: string | null;
}): Promise<string> => {
  const content = new TextEncoder().encode(
    stableSerializeLanguageAnalysis({
      contract: "cat.plugin-runtime-configuration/v1",
      ...input,
    }),
  );
  const digest = await crypto.subtle.digest("SHA-256", content);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

export const getPluginConfig = async (
  drizzle: DbHandle,
  pluginId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<JSONType> => {
  const config = await getPluginRuntimeConfigurationSnapshot(
    drizzle,
    pluginId,
    scopeType,
    scopeId,
  );
  // FUTURE: scope config inheritance
  return config.semanticConfig;
};

export const getPluginRuntimeConfigurationSnapshot = async (
  drizzle: DbHandle,
  pluginId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<PluginRuntimeConfigurationSnapshot> => {
  const [definition, data] = await Promise.all([
    executeQuery({ db: drizzle }, getPluginConfigDefinition, { pluginId }),
    executeQuery({ db: drizzle }, getPluginConfigInstance, {
      pluginId,
      scopeType,
      scopeId,
    }),
  ]);

  if (!definition || !definition.isAvailable) {
    const semanticConfig = freezeJson({});
    return Object.freeze({
      semanticConfig,
      configurationDigest: await configurationDigest({
        semanticConfig,
        appliedVersion: null,
        schemaVersion: null,
        schemaDigest: null,
      }),
      appliedVersion: null,
      schemaVersion: null,
      schemaDigest: null,
    });
  }
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

  const semanticConfig = freezeJson(data.value);
  return Object.freeze({
    semanticConfig,
    configurationDigest: await configurationDigest({
      semanticConfig,
      appliedVersion: data.appliedVersion,
      schemaVersion: definition.schemaVersion,
      schemaDigest: definition.schemaDigest,
    }),
    appliedVersion: data.appliedVersion,
    schemaVersion: definition.schemaVersion,
    schemaDigest: definition.schemaDigest,
  });
};
