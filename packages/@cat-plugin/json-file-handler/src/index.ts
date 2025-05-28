import { CatPlugin, TranslatableFileHandlerRegistry } from "@cat/plugin-core";
import { JSONTranslatableFileHandler } from "./handler";

class Plugin implements CatPlugin {
  async onLoaded() {
    TranslatableFileHandlerRegistry.getInstance().register(
      new JSONTranslatableFileHandler(),
    );
  }
}

const plugin = new Plugin();

export default plugin;
