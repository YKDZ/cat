import type { AuthNodeExecutor } from "../types.ts";

/**
 * plugin_custom — delegate execution to a plugin-provided executor.
 * The `factorId` on the node definition selects which AUTH_FACTOR plugin to call.
 * If no plugin is registered for the factorId, returns a failed result.
 */
export const pluginCustomExecutor: AuthNodeExecutor = async (ctx, nodeDef) => {
  // Actual dispatch to plugin is wired in the app-layer executor override.
  return {
    updates: {},
    status: "failed",
    error: {
      code: "PLUGIN_NOT_CONFIGURED",
      message: `No plugin executor registered for factorId "${nodeDef.factorId ?? "unknown"}" (node "${nodeDef.id}")`,
    },
  };
};
