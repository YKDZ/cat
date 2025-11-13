import type { CatPlugin, ServiceMap, ServiceMapRecord } from "@cat/plugin-core";
import { YAMLTranslatableFileHandler } from "./handler";

class Plugin implements CatPlugin {
  async install(serviceMap: ServiceMap) {
    serviceMap.register(
      {
        type: "TRANSLATABLE_FILE_HANDLER",
        id: "YAML",
      } satisfies ServiceMapRecord,
      new YAMLTranslatableFileHandler(),
    );
  }
}

const plugin = new Plugin();

export default plugin;
