import type { CatPlugin, PluginContext } from "@cat/plugin-core";

import { SingleConfigSchema, TEIRerankProvider } from "./service";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    const rawConfigs = Array.isArray(ctx.config)
      ? ctx.config
      : ctx.config
        ? [ctx.config]
        : [{}];

    const configs = rawConfigs.flatMap((rawConfig) => {
      const parsed = SingleConfigSchema.safeParse(rawConfig);
      return parsed.success ? [parsed.data] : [];
    });

    return configs.map((config) => new TEIRerankProvider(config));
  }
}

export default new Plugin();
