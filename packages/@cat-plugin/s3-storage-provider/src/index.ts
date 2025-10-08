import type { CatPlugin, PluginGetterOptions } from "@cat/plugin-core";
import { S3StorageProvider } from "./provider.ts";

class Plugin implements CatPlugin {
  getStorageProviders(options: PluginGetterOptions) {
    return [new S3StorageProvider(options.config ?? {})];
  }
}

const plugin = new Plugin();

export default plugin;
