import type { CatPlugin, PluginContext } from "@cat/plugin-core";
import { Provider } from "./provider.ts";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    return [new Provider(ctx.config ?? {})];
  }
}

const plugin = new Plugin();

export default plugin;
