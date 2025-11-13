import type {
  CatPlugin,
  PluginInstallOptions,
  ServiceMap,
  ServiceMapRecord,
} from "@cat/plugin-core";
import { Vectorizer } from "./vectorizer.ts";

class Plugin implements CatPlugin {
  async install(serviceMap: ServiceMap, options?: PluginInstallOptions) {
    serviceMap.register(
      {
        type: "TEXT_VECTORIZER",
        id: "ollama",
      } satisfies ServiceMapRecord,
      new Vectorizer(options?.config ?? {}),
    );
  }
}

const plugin = new Plugin();

export default plugin;
