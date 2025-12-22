import type {
  CatPlugin,
  ComponentData,
  IPluginService,
} from "@cat/plugin-core";

class Plugin implements CatPlugin {
  async install(_services: IPluginService[], components: ComponentData[]) {
    components.push({
      name: "daily-quote-widget",
      slot: "test",
      url: "dist/daily-quote-widget.js",
      skeleton: "dist/daily-quote-widget-skeleton.js",
    } satisfies ComponentData);
  }
}

const plugin = new Plugin();

export default plugin;
