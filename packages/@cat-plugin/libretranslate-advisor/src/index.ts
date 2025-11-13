import type {
  CatPlugin,
  PluginInstallOptions,
  ServiceMap,
  ServiceMapRecord,
} from "@cat/plugin-core";
import { LibreTranslateTranslationAdvisor } from "./advisor.ts";

class Plugin implements CatPlugin {
  async install(serviceMap: ServiceMap, options?: PluginInstallOptions) {
    serviceMap.register(
      {
        type: "TRANSLATION_ADVISOR",
        id: "libretranslate",
      } satisfies ServiceMapRecord,
      new LibreTranslateTranslationAdvisor(options?.config ?? {}),
    );
  }
}

const plugin = new Plugin();

export default plugin;
