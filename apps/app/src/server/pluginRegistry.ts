import { PluginRegistry } from "@cat/plugin-core";

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention, no-var
  var __PLUGIN_REGISTRY__: PluginRegistry | undefined;
}

const getPluginRegistry = async (): Promise<PluginRegistry> => {
  if (!globalThis["__PLUGIN_REGISTRY__"]) {
    const pluginRegistry = new PluginRegistry();
    await pluginRegistry.loadPlugins();
    globalThis["__PLUGIN_REGISTRY__"] = pluginRegistry;
  }
  return globalThis["__PLUGIN_REGISTRY__"]!;
};

export default getPluginRegistry;
