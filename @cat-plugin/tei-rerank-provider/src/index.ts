import type { CatPlugin, PluginContext } from "@cat/plugin-core";

import { ConfigSchema, TEIRerankProvider } from "./service";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    // When the plugin is installed but not yet configured, ctx.config may be
    // null, undefined, or a non-array value. Fall back to an empty array so
    // the server does not crash on startup.
    const raw = Array.isArray(ctx.config) ? ctx.config : [];
    const configs = ConfigSchema.parse(raw);
    return configs.map((config) => new TEIRerankProvider(config));
  }
}

export default new Plugin();
