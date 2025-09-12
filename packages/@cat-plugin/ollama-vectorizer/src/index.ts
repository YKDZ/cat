import type {
  CatPlugin,
  PluginGetterOptions,
  PluginLoadOptions,
} from "@cat/plugin-core";
import { Vectorizer } from "./vectorizer.ts";

class Plugin implements CatPlugin {
  async onLoaded(options: PluginLoadOptions) {}

  getTextVectorizers(options: PluginGetterOptions) {
    return [new Vectorizer(options.config ?? {})];
  }
}

const plugin = new Plugin();

export default plugin;
