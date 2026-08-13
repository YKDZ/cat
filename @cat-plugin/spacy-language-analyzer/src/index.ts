import type { CatPlugin, PluginContext } from "@cat/plugin-core";

import packageMetadata from "../package.json" with { type: "json" };
import { SpacyLanguageAnalyzer } from "./language-analyzer.ts";

class Plugin implements CatPlugin {
  services(ctx: PluginContext) {
    const scope =
      ctx.scopeType === "GLOBAL" ||
      ctx.scopeType === "PROJECT" ||
      ctx.scopeType === "USER"
        ? { scopeType: ctx.scopeType, scopeId: ctx.scopeId }
        : { scopeType: "GLOBAL" as const, scopeId: "" };
    return [
      new SpacyLanguageAnalyzer(
        ctx.config ?? {},
        scope,
        { name: packageMetadata.name, version: packageMetadata.version },
        ctx.logger,
      ),
    ];
  }
}

const plugin = new Plugin() satisfies CatPlugin;

export default plugin;
