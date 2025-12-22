import type { CatPlugin, IPluginService } from "@cat/plugin-core";
import { Extractor } from "./extractor.ts";

class Plugin implements CatPlugin {
  async install(services: IPluginService[]) {
    services.push(new Extractor());
  }
}

const plugin = new Plugin();

export default plugin;
