import type { PrismaClient } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __PLUGIN_REGISTRY__: PluginRegistry | undefined;
}

const getPluginRegistry = async (): Promise<PluginRegistry> => {
  if (!globalThis["__PLUGIN_REGISTRY__"]) {
    const pluginRegistry = new PluginRegistry();
    globalThis["__PLUGIN_REGISTRY__"] = pluginRegistry;
  }
  return globalThis["__PLUGIN_REGISTRY__"]!;
};

export default getPluginRegistry;
