import type {
  AuthProvider,
  CatPlugin,
  PluginLoadOptions,
} from "@cat/plugin-core";
import { Provider } from "./provider";

class Plugin implements CatPlugin {
  public options: PluginLoadOptions | null = null;

  async onLoaded(options: PluginLoadOptions) {
    this.options = options;
  }

  getAuthProviders() {
    return [new Provider()];
  }
}

const plugin = new Plugin();

export default plugin;
