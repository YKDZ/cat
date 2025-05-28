import { CatPlugin, TranslationAdvisorRegistry } from "@cat/plugin-core";
import { Advisor } from "./advisor";

export default class Plugin implements CatPlugin {
  async onLoaded() {
    TranslationAdvisorRegistry.getInstance().register(new Advisor());
  }
}
