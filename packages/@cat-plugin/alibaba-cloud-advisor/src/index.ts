import type { CatPlugin, PluginGetterOptions } from "@cat/plugin-core";
import { Advisor } from "./advisor";

export default class Plugin implements CatPlugin {
  async onLoaded() {}

  getTranslationAdvisors(options: PluginGetterOptions) {
    return [new Advisor()];
  }
}
