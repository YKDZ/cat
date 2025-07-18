import type { Plugin } from "@cat/shared";
import { defineStore } from "pinia";
import { shallowRef } from "vue";

export const usePluginStore = defineStore("plugin", () => {
  const plugins = shallowRef<Plugin[]>([]);

  const addPlugins = (...pluginsToAdd: Plugin[]) => {
    for (const plugin of pluginsToAdd) {
      if (!plugin) continue;

      const currentIndex = plugins.value.findIndex(
        (p: Plugin) => p.id === plugin.id,
      );
      if (currentIndex === -1) {
        plugins.value.push(plugin);
      } else {
        plugins.value.splice(currentIndex, 1, plugin);
      }
    }
  };

  return {
    plugins,
    addPlugins,
  };
});
