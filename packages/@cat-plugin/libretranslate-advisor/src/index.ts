import type {
  CatPlugin,
  PluginGetterOptions,
  PluginLoadOptions,
} from "@cat/plugin-core";
import { LibreTranslateTranslationAdvisor } from "./advisor.ts";

class Plugin implements CatPlugin {
  async onLoaded(options: PluginLoadOptions) {}

  getTranslationAdvisors(options: PluginGetterOptions) {
    return [new LibreTranslateTranslationAdvisor(options.config ?? {})];
  }
}

const plugin = new Plugin();

export default plugin;
