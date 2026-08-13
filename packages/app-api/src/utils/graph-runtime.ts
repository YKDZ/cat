import type { DbHandle } from "@cat/domain";
import type { PluginManager } from "@cat/plugin-core";
import {
  createDefaultGraphRuntime,
  getGlobalGraphRuntimeOrNull,
  type DefaultGraphRuntime,
} from "@cat/workflow";

let graphRuntime: DefaultGraphRuntime | null = null;

export const getGraphRuntime = async (
  db: DbHandle,
  pluginManager: PluginManager,
): Promise<DefaultGraphRuntime> => {
  if (!graphRuntime) {
    graphRuntime =
      getGlobalGraphRuntimeOrNull() ??
      createDefaultGraphRuntime(db, pluginManager);
  }
  await graphRuntime.ensureTaskRecovery();
  return graphRuntime;
};
