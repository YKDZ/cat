import type { CatPlugin } from "@cat/plugin-core";
import { Exporter, Importer } from "./handler";

class Plugin implements CatPlugin {
  services() {
    return [new Importer(), new Exporter()];
  }
}

const plugin = new Plugin();

export default plugin;
