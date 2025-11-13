import type { CatPlugin, ServiceMap, ServiceMapRecord } from "@cat/plugin-core";
import { Provider } from "./provider.ts";

class Plugin implements CatPlugin {
  async install(serviceMap: ServiceMap) {
    serviceMap.register(
      {
        type: "AUTH_PROVIDER",
        id: "EMAIL_PASSWORD",
      } satisfies ServiceMapRecord,
      new Provider(),
    );
  }
}

const plugin = new Plugin();

export default plugin;
