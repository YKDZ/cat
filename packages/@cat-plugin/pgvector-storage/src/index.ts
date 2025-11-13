import type { CatPlugin, ServiceMap, ServiceMapRecord } from "@cat/plugin-core";
import { Storage } from "./storage.ts";

class Plugin implements CatPlugin {
  async install(serviceMap: ServiceMap) {
    serviceMap.register(
      {
        type: "VECTOR_STORAGE",
        id: "pgvector-storage",
      } satisfies ServiceMapRecord,
      new Storage(),
    );
  }
}

const plugin = new Plugin();

export default plugin;
