import type { CatPlugin, IPluginService } from "@cat/plugin-core";
import { MarkdownTranslatableFileHandler } from "./handler.ts";

class Plugin implements CatPlugin {
  async install(services: IPluginService[]) {
    services.push(new MarkdownTranslatableFileHandler());
  }
}

const plugin = new Plugin();

export default plugin;
