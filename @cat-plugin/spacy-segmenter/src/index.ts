import type { CatPlugin, PluginContext } from "@cat/plugin-core";

import { SpacyWordSegmenter } from "./segmenter";

export { SpacyWordSegmenter } from "./segmenter";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    return [new SpacyWordSegmenter(ctx.config ?? {}, ctx.logger)];
  }
}

const plugin = new Plugin();

export default plugin;
