import type {
  CatPlugin,
  GetTranslationAdvisorsOptions,
  PluginLoadOptions,
} from "@cat/plugin-core";
import { LibreTranslateTranslationAdvisor } from "./advisor";

class Plugin implements CatPlugin {
  public options: PluginLoadOptions | null = null;

  async onLoaded(options: PluginLoadOptions) {
    this.options = options;
  }

  getTranslationAdvisors(options?: GetTranslationAdvisorsOptions) {
    return [
      new LibreTranslateTranslationAdvisor(
        !options || !options.userConfigs || options.userConfigs.length === 0
          ? this.options!.configs!
          : options.userConfigs,
      ),
    ];
  }
}

const plugin = new Plugin();

export default plugin;
