import type { CatPlugin, PluginContext } from "@cat/plugin-core";
import { Vectorizer } from "./vectorizer.ts";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    return [new Vectorizer(ctx.config ?? {})];
  }
}

const plugin = new Plugin();

export default plugin;
