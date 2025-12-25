import type { CatPlugin } from "@cat/plugin-core";
import { Storage } from "./storage.ts";

class Plugin implements CatPlugin {
  services() {
    return [new Storage()];
  }
}

const plugin = new Plugin();

export default plugin;
