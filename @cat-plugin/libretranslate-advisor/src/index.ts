import type { CatPlugin, PluginContext } from "@cat/plugin-core";

import { Advisor } from "./advisor.ts";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    return [new Advisor(ctx.config ?? {}, ctx.logger)];
  }
}

const plugin = new Plugin() satisfies CatPlugin;

export default plugin;
