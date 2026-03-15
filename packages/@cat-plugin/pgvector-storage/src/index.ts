import type { CatPlugin, PluginContext } from "@cat/plugin-core";

import { Storage } from "./storage.ts";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    return [new Storage(ctx.capabilities)];
  }
}

const plugin = new Plugin();

export default plugin;
