import { CatPlugin, TranslationAdvisorRegistry } from "@cat/plugin-core";
import { Advisor } from "./advisor";

export default class Plugin implements CatPlugin {
  getId(): string {
    return "Alibaba Cloud Translation";
  }

  async onLoaded() {
    TranslationAdvisorRegistry.getInstance().register(new Advisor());
  }
}
