import type {
  CatPlugin,
  ComponentData,
  IPluginService,
  PluginInstallOptions,
} from "@cat/plugin-core";
import { Vectorizer } from "./vectorizer.ts";

class Plugin implements CatPlugin {
  async install(
    services: IPluginService[],
    components: ComponentData[],
    options?: PluginInstallOptions,
  ) {
    services.push(new Vectorizer(options?.config ?? {}));
  }
}

const plugin = new Plugin();

export default plugin;
