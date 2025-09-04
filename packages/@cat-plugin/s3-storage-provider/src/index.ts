import type {
  CatPlugin,
  PluginGetterOptions,
  PluginLoadOptions,
} from "@cat/plugin-core";
import { S3StorageProvider } from "./provider";

class Plugin implements CatPlugin {
  public options: PluginLoadOptions | null = null;

  async onLoaded(options: PluginLoadOptions) {
    this.options = options;
  }

  getStorageProviders(options: PluginGetterOptions) {
    return [
      new S3StorageProvider(
        !options || !options.configs || options.configs.length === 0
          ? this.options!.configs!
          : options.configs,
      ),
    ];
  }
}

const plugin = new Plugin();

export default plugin;
