import type { CatPlugin, ServiceMap, ServiceMapRecord } from "@cat/plugin-core";
import { Extractor } from "./extractor.ts";

class Plugin implements CatPlugin {
  async install(serviceMap: ServiceMap) {
    serviceMap.register(
      {
        type: "TERM_EXTRACTOR",
        id: "openai",
      } satisfies ServiceMapRecord,
      new Extractor(),
    );
  }
}

const plugin = new Plugin();

export default plugin;
