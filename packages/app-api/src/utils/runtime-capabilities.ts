import type {
  CacheStore,
  DrizzleDB,
  RedisConnection,
  SessionStore,
} from "@cat/domain";
import type { PluginManager } from "@cat/plugin-core";

const bridgeKey = "__CAT_RUNTIME_CAPABILITIES_V1__";
const bridgeIdentityKey = "__CAT_RUNTIME_CAPABILITIES_IDENTITY__";
const initializedKey = "__CAT_INITIALIZED__";
const bridgeVersion = 1;

export type RuntimeCapabilities = {
  baseURL: string;
  cacheStore: CacheStore;
  drizzleDB: DrizzleDB;
  name: string;
  pluginManager: PluginManager;
  redis: RedisConnection | undefined;
  sessionStore: SessionStore;
};

type RuntimeCapabilitiesBridge = {
  capabilities: RuntimeCapabilities;
  identity: symbol;
  state: "ready";
  version: typeof bridgeVersion;
};

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null;

const assertBridge = (value: unknown): RuntimeCapabilitiesBridge => {
  if (!isRecord(value)) {
    throw new Error("CAT runtime capabilities have not been initialized");
  }
  const capabilities = Reflect.get(value, "capabilities");
  const identity = Reflect.get(value, "identity");
  if (
    Reflect.get(value, "version") !== bridgeVersion ||
    Reflect.get(value, "state") !== "ready" ||
    typeof identity !== "symbol" ||
    !isRecord(capabilities) ||
    !Reflect.get(capabilities, "drizzleDB") ||
    !Reflect.get(capabilities, "pluginManager") ||
    !Reflect.get(capabilities, "cacheStore") ||
    !Reflect.get(capabilities, "sessionStore") ||
    typeof Reflect.get(capabilities, "name") !== "string" ||
    typeof Reflect.get(capabilities, "baseURL") !== "string"
  ) {
    throw new Error("CAT runtime capability bridge is invalid");
  }
  return value as RuntimeCapabilitiesBridge;
};

/**
 * Returns the host runtime's capabilities without creating realm-local fallbacks.
 * Vite can evaluate SSR modules in another realm, but Node's process object is
 * shared and is therefore the only supported bridge between those realms.
 */
export const getRuntimeCapabilities = (): RuntimeCapabilities => {
  const bridge = assertBridge(Reflect.get(process, bridgeKey));
  if (
    Reflect.get(process, initializedKey) !== true ||
    Reflect.get(process, bridgeIdentityKey) !== bridge.identity
  ) {
    throw new Error("CAT runtime capability bridge is not ready");
  }
  return bridge.capabilities;
};

export const hasRuntimeCapabilities = (): boolean =>
  Reflect.get(process, bridgeKey) !== undefined;

export const publishRuntimeCapabilities = (
  capabilities: RuntimeCapabilities,
): void => {
  const existing = Reflect.get(process, bridgeKey);
  if (existing !== undefined) {
    const current = assertBridge(existing);
    if (current.capabilities !== capabilities) {
      throw new Error(
        "CAT runtime capabilities are already owned by another realm",
      );
    }
    return;
  }
  const identity = Symbol("cat-runtime-capabilities");
  const bridge: RuntimeCapabilitiesBridge = Object.freeze({
    capabilities: Object.freeze({ ...capabilities }),
    identity,
    state: "ready",
    version: bridgeVersion,
  });
  Reflect.set(process, bridgeKey, bridge);
  Reflect.set(process, bridgeIdentityKey, identity);
  Reflect.set(process, initializedKey, true);
};

export const resetRuntimeCapabilitiesForTest = (): void => {
  Reflect.deleteProperty(process, bridgeKey);
  Reflect.deleteProperty(process, bridgeIdentityKey);
  Reflect.deleteProperty(process, initializedKey);
};
