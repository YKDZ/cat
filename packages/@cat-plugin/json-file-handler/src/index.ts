import type { CatPlugin, ServiceMap, ServiceMapRecord } from "@cat/plugin-core";
import { JSONTranslatableFileHandler } from "./handler";

class Plugin implements CatPlugin {
  async install(serviceMap: ServiceMap) {
    serviceMap.register(
      {
        type: "TRANSLATABLE_FILE_HANDLER",
        id: "JSON",
      } satisfies ServiceMapRecord,
      new JSONTranslatableFileHandler(),
    );
  }
}

const plugin = new Plugin();

export default plugin;
