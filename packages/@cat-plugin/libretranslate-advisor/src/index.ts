import type {
  CatPlugin,
  PluginGetterOptions,
  PluginLoadOptions,
} from "@cat/plugin-core";
import { LibreTranslateTranslationAdvisor } from "./advisor";

class Plugin implements CatPlugin {
  public options: PluginLoadOptions | null = null;

  async onLoaded(options: PluginLoadOptions) {
    this.options = options;
  }

  getTranslationAdvisors(options?: PluginGetterOptions) {
    return [
      new LibreTranslateTranslationAdvisor(
        !options || !options.configs || options.configs.length === 0
          ? this.options!.configs!
          : options.configs,
      ),
    ];
  }
}

const plugin = new Plugin();

export default plugin;
