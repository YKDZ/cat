import { CatPlugin, TextVectorizerRegistry } from "@cat/plugin-core";
import { Vectorizer } from "./vectorizer";

class Plugin implements CatPlugin {
  async onLoaded() {
    TextVectorizerRegistry.getInstance().register(new Vectorizer());
  }
}

const plugin = new Plugin();

export default plugin;
