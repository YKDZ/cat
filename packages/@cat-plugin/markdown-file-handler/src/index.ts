import type { CatPlugin, ServiceMap, ServiceMapRecord } from "@cat/plugin-core";
import { MarkdownTranslatableFileHandler } from "./handler.ts";

class Plugin implements CatPlugin {
  async install(serviceMap: ServiceMap) {
    serviceMap.register(
      {
        type: "TRANSLATABLE_FILE_HANDLER",
        id: "MARKDOWN",
      } satisfies ServiceMapRecord,
      new MarkdownTranslatableFileHandler(),
    );
  }
}

const plugin = new Plugin();

export default plugin;
