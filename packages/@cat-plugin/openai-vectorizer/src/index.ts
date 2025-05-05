import { CatPlugin } from "@cat/plugin-core";

export default class Plugin implements CatPlugin {
  getId(): string {
    return "LibreTranslate";
  }

  async onLoaded() {}
}
