import type { CatPlugin, PluginContext } from "@cat/plugin-core";

import { ConfigSchema, OpenAILLMProvider } from "./service";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    const configs = ConfigSchema.parse(ctx.config ?? []);
    return configs.map((config) => new OpenAILLMProvider(config));
  }
}

export default new Plugin();
