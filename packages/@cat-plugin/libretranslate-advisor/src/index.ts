import type { CatPlugin, ServicesContext } from "@cat/plugin-core";
import { Advisor } from "./advisor.ts";

class Plugin implements CatPlugin {
  services(ctx: ServicesContext) {
    return [new Advisor(ctx.config ?? {})];
  }
}

const plugin = new Plugin();

export default plugin;
