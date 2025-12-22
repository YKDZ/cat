import type { CatPlugin, IPluginService } from "@cat/plugin-core";
import { YAMLTranslatableFileHandler } from "./handler";

class Plugin implements CatPlugin {
  async install(services: IPluginService[]) {
    services.push(new YAMLTranslatableFileHandler());
  }
}

const plugin = new Plugin();

export default plugin;
