import type { CatPlugin, PluginLoadOptions } from "@cat/plugin-core";
import { Vectorizer } from "./vectorizer";

class Plugin implements CatPlugin {
  public options: PluginLoadOptions | null = null;

  async onLoaded(options: PluginLoadOptions) {
    this.options = options;
  }

  getTextVectorizers() {
    return [new Vectorizer(this.options!)];
  }
}

const plugin = new Plugin();

export default plugin;
