import type { CatPlugin, ComponentData } from "@cat/plugin-core";

class Plugin implements CatPlugin {
  components() {
    return [
      {
        name: "daily-quote-widget",
        slot: "test",
        url: "dist/daily-quote-widget.js",
      } satisfies ComponentData,
    ];
  }
}

const plugin = new Plugin();

export default plugin;
