import type { CatPlugin, PluginContext } from "@cat/plugin-core";

import { OpenAILLMProvider } from "./service";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    const config = ctx.config ?? {};
    return [new OpenAILLMProvider(config)];
  }
}

export default new Plugin();
