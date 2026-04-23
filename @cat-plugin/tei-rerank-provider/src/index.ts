import type { CatPlugin, PluginContext } from "@cat/plugin-core";

import { ConfigSchema, TEIRerankProvider } from "./service";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    const configs = ConfigSchema.parse(ctx.config ?? []);
    return configs.map((config) => new TEIRerankProvider(config));
  }
}

export default new Plugin();
