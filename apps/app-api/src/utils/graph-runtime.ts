import type { DbHandle } from "@cat/domain";
import type { PluginManager } from "@cat/plugin-core";

import {
  createDefaultGraphRuntime,
  type DefaultGraphRuntime,
} from "@cat/agent";

let _graphRuntime: DefaultGraphRuntime | null = null;

export const getGraphRuntime = async (
  db: DbHandle,
  pluginManager: PluginManager,
): Promise<DefaultGraphRuntime> => {
  if (!_graphRuntime) {
    _graphRuntime = createDefaultGraphRuntime(db, pluginManager);
  }
  return _graphRuntime;
};
