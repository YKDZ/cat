import type { CatPlugin } from "@cat/plugin-core";
import { YAMLTranslatableFileHandler } from "./handler";

class Plugin implements CatPlugin {
  getTranslatableFileHandlers() {
    return [new YAMLTranslatableFileHandler()];
  }
}

const plugin = new Plugin();

export default plugin;
