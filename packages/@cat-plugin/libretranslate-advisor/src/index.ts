import type {
  CatPlugin,
  ComponentData,
  IPluginService,
  PluginInstallOptions,
} from "@cat/plugin-core";
import { LibreTranslateTranslationAdvisor } from "./advisor.ts";

class Plugin implements CatPlugin {
  async install(
    services: IPluginService[],
    components: ComponentData[],
    options?: PluginInstallOptions,
  ) {
    services.push(new LibreTranslateTranslationAdvisor(options?.config ?? {}));
  }
}

const plugin = new Plugin();

export default plugin;
