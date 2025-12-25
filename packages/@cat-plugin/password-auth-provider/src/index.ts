import type { CatPlugin } from "@cat/plugin-core";
import { Provider } from "./provider.ts";

class Plugin implements CatPlugin {
  services() {
    return [new Provider()];
  }
}

const plugin = new Plugin();

export default plugin;
