import type {
  CatPlugin,
  PluginInstallOptions,
  ServiceMap,
  ServiceMapRecord,
} from "@cat/plugin-core";
import { S3StorageProvider } from "./provider.ts";

class Plugin implements CatPlugin {
  async install(serviceMap: ServiceMap, options?: PluginInstallOptions) {
    serviceMap.register(
      {
        type: "STORAGE_PROVIDER",
        id: "S3",
      } satisfies ServiceMapRecord,
      new S3StorageProvider(options?.config ?? {}),
    );
  }
}

const plugin = new Plugin();

export default plugin;
