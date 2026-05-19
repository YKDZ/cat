import type { CatPlugin, PluginContext } from "@cat/plugin-core";

import { SingleConfigSchema, OpenAILLMProvider } from "./service";

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

    return configs.map((config) => new OpenAILLMProvider(config));
  }
}

export default new Plugin();
