import type { CatPlugin, PluginGetterOptions } from "@cat/plugin-core";
import { Vectorizer } from "./vectorizer.ts";

class Plugin implements CatPlugin {
  getTextVectorizers(options: PluginGetterOptions) {
    return [new Vectorizer(options.config ?? {})];
  }
}

const plugin = new Plugin();

export default plugin;
