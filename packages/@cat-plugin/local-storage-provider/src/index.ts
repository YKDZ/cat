import type { CatPlugin, ServicesContext } from "@cat/plugin-core";
import { Provider } from "./provider.ts";

class Plugin implements CatPlugin {
  services(ctx: ServicesContext) {
    return [new Provider(ctx.config ?? {})];
  }
}

const plugin = new Plugin();

export default plugin;
