import type { CatPlugin } from "@cat/plugin-core";
import { Extractor } from "./extractor.ts";

class Plugin implements CatPlugin {
  services() {
    return [new Extractor()];
  }
}

const plugin = new Plugin();

export default plugin;
