import type { CatPlugin, PluginContext } from "@cat/plugin-core";

import { PasswordFactor } from "./factor.ts";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    return [new PasswordFactor(ctx.capabilities)];
  }
}

const plugin = new Plugin();

export default plugin;
