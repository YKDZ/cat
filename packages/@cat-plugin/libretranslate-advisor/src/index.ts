import type { CatPlugin, PluginGetterOptions } from "@cat/plugin-core";
import { LibreTranslateTranslationAdvisor } from "./advisor.ts";

class Plugin implements CatPlugin {
  getTranslationAdvisors(options: PluginGetterOptions) {
    return [new LibreTranslateTranslationAdvisor(options.config ?? {})];
  }
}

const plugin = new Plugin();

export default plugin;
