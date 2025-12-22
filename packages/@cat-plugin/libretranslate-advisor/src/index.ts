import type {
  CatPlugin,
  ComponentRecord,
  IPluginService,
  PluginInstallOptions,
} from "@cat/plugin-core";
import { LibreTranslateTranslationAdvisor } from "./advisor.ts";

class Plugin implements CatPlugin {
  async install(
    services: IPluginService[],
    components: ComponentRecord[],
    options?: PluginInstallOptions,
  ) {
    services.push(new LibreTranslateTranslationAdvisor(options?.config ?? {}));
  }
}

const plugin = new Plugin();

export default plugin;
