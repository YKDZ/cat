import type { CatPlugin, PluginContext } from "@cat/plugin-core";
import { OpenAITermExtractor, OpenAITermAligner } from "./service";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    const config = ctx.config ?? {};
    return [new OpenAITermExtractor(config), new OpenAITermAligner(config)];
  }
}

export default new Plugin();
