import type { CatPlugin, PluginGetterOptions } from "@cat/plugin-core";
import { getESTermService } from "./service.ts";
import { ConfigSchema } from "./service.ts";

class Plugin implements CatPlugin {
  getTermServices(options: PluginGetterOptions) {
    return [getESTermService(ConfigSchema.parse(options.config))];
  }
}

const plugin = new Plugin();

export default plugin;
