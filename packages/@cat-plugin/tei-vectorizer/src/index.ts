import type { CatPlugin} from "@cat/plugin-core";
import { TextVectorizerRegistry } from "@cat/plugin-core";
import { Vectorizer } from "./vectorizer";

export default class Plugin implements CatPlugin {
  async onLoaded() {
    TextVectorizerRegistry.getInstance().register(new Vectorizer());
  }
}
