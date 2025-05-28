import { CatPlugin, TranslationAdvisorRegistry } from "@cat/plugin-core";
import { LibreTranslateTranslationAdvisor } from "./advisor";

class Plugin implements CatPlugin {
  async onLoaded() {
    TranslationAdvisorRegistry.getInstance().register(
      new LibreTranslateTranslationAdvisor(),
    );
  }
}

const plugin = new Plugin();

export default plugin;
