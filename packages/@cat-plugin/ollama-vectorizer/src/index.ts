import { CatPlugin } from "@cat/plugin-core";
import { Vectorizer } from "./vectorizer";

class Plugin implements CatPlugin {
  async onLoaded() {}
  getTextVectorizers() {
    return [new Vectorizer()];
  }
}

const plugin = new Plugin();

export default plugin;
