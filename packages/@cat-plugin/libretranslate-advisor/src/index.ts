import { CatPlugin, PluginLoadOptions } from "@cat/plugin-core";
import { LibreTranslateTranslationAdvisor } from "./advisor";

class Plugin implements CatPlugin {
  public options: PluginLoadOptions | null = null;

  async onLoaded(options: PluginLoadOptions) {
    this.options = options;
  }
  getTranslationAdvisors() {
    return [new LibreTranslateTranslationAdvisor(this.options!)];
  }
}

const plugin = new Plugin();

export default plugin;
