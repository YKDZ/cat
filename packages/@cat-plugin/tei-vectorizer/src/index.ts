import { CatPlugin, TextVectorizerRegistry } from "@cat/plugin-core";
import { Vectorizer } from "./vectorizer";

export default class Plugin implements CatPlugin {
  getId(): string {
    return "TEI Vectorizer";
  }

  async onLoaded() {
    TextVectorizerRegistry.getInstance().register(new Vectorizer());
  }
}
