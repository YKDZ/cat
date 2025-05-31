import { CatPlugin } from "@cat/plugin-core";
import { LibreTranslateTranslationAdvisor } from "./advisor";

class Plugin implements CatPlugin {
  async onLoaded() {}
  getTranslationAdvisors() {
    return [new LibreTranslateTranslationAdvisor()];
  }
}

const plugin = new Plugin();

export default plugin;
