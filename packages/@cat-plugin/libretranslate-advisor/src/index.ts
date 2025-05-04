import { CatPlugin, TranslationAdvisorRegistry } from "@cat/plugin-core";
import { LibreTranslateTranslationAdvisor } from "./advisor";

export default class Plugin implements CatPlugin {
  getId(): string {
    return "LibreTranslate";
  }

  async onLoaded() {
    TranslationAdvisorRegistry.getInstance().register(
      new LibreTranslateTranslationAdvisor(),
    );
  }
}
