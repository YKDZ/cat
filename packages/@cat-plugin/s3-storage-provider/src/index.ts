import type { CatPlugin, ServicesContext } from "@cat/plugin-core";
import { S3StorageProvider } from "./provider.ts";

class Plugin implements CatPlugin {
  services(ctx: ServicesContext) {
    return [new S3StorageProvider(ctx.config ?? {})];
  }
}

const plugin = new Plugin();

export default plugin;
