import type { CatPlugin, IPluginService } from "@cat/plugin-core";
import { Storage } from "./storage.ts";

class Plugin implements CatPlugin {
  async install(services: IPluginService[]) {
    services.push(new Storage());
  }
}

const plugin = new Plugin();

export default plugin;
