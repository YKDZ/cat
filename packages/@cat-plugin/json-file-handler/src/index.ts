import { CatPlugin, TranslatableFileHandlerRegistry } from "@cat/plugin-core";
import { JSONTranslatableFileHandler } from "./handler";

export default class Plugin implements CatPlugin {
  getId(): string {
    return "JSON File Handler";
  }

  async onLoaded() {
    TranslatableFileHandlerRegistry.getInstance().register(
      new JSONTranslatableFileHandler(),
    );
  }
}
