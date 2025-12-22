import type { CatPlugin, IPluginService } from "@cat/plugin-core";
import { Provider } from "./provider.ts";

class Plugin implements CatPlugin {
  async install(services: IPluginService[]) {
    services.push(new Provider());
  }
}

const plugin = new Plugin();

export default plugin;
