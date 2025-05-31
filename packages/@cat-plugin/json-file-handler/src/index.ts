import { CatPlugin } from "@cat/plugin-core";
import { JSONTranslatableFileHandler } from "./handler";

class Plugin implements CatPlugin {
  async onLoaded() {}
  getTranslatableFileHandlers() {
    return [new JSONTranslatableFileHandler()];
  }
}

const plugin = new Plugin();

export default plugin;
