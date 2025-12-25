import type { CatPlugin } from "@cat/plugin-core";
import { Handler } from "./handler";

class Plugin implements CatPlugin {
  services() {
    return [new Handler()];
  }
}

const plugin = new Plugin();

export default plugin;
