import type {
  CatPlugin,
  ComponentRecord,
  IPluginService,
  PluginInstallOptions,
} from "@cat/plugin-core";
import { S3StorageProvider } from "./provider.ts";

class Plugin implements CatPlugin {
  async install(
    services: IPluginService[],
    components: ComponentRecord[],
    options?: PluginInstallOptions,
  ) {
    services.push(new S3StorageProvider(options?.config ?? {}));
  }
}

const plugin = new Plugin();

export default plugin;
