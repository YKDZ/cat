import type { CatPlugin } from "@cat/plugin-core";
import { Handler } from "./handler.ts";

class Plugin implements CatPlugin {
  services() {
    return [new Handler()];
  }
}

const plugin = new Plugin();

export default plugin;
