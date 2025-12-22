import type { CatPlugin, IPluginService } from "@cat/plugin-core";
import { JSONTranslatableFileHandler } from "./handler";

class Plugin implements CatPlugin {
  async install(services: IPluginService[]) {
    services.push(new JSONTranslatableFileHandler());
  }
}

const plugin = new Plugin();

export default plugin;
