import type {
  CatPlugin,
  PluginInstallOptions,
  ServiceMap,
  ServiceMapRecord,
} from "@cat/plugin-core";
import { getESTermService } from "./service.ts";
import { ConfigSchema } from "./service.ts";

class Plugin implements CatPlugin {
  async install(serviceMap: ServiceMap, options?: PluginInstallOptions) {
    serviceMap.register(
      {
        type: "TERM_SERVICE",
        id: "ES",
      } satisfies ServiceMapRecord,
      getESTermService(ConfigSchema.parse(options?.config)),
    );
  }
}

const plugin = new Plugin();

export default plugin;
