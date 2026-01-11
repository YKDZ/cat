import type { CatPlugin, PluginContext } from "@cat/plugin-core";
import { Advisor } from "./advisor.ts";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    return [new Advisor(ctx.config ?? {})];
  }
}

const plugin = new Plugin();

export default plugin;
