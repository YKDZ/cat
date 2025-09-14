import type { CatPlugin, PluginLoadOptions } from "@cat/plugin-core";
import { Provider } from "./provider.ts";

class Plugin implements CatPlugin {
  private options: PluginLoadOptions | null = null;

  async onLoaded() {}

  getAuthProviders() {
    return [new Provider()];
  }
}

const plugin = new Plugin();

export default plugin;
