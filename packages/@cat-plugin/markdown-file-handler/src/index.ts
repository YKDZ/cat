import type { CatPlugin } from "@cat/plugin-core";
import { MarkdownTranslatableFileHandler } from "./handler.ts";

class Plugin implements CatPlugin {
  getTranslatableFileHandlers() {
    return [new MarkdownTranslatableFileHandler()];
  }
}

const plugin = new Plugin();

export default plugin;
