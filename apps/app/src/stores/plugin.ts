import type { ComponentRecord } from "@cat/plugin-core";

import { defineStore } from "pinia";
import { ref } from "vue";

export const usePluginStore = defineStore("plugin", () => {
  const components = ref(new Map<string, ComponentRecord[]>());

  const addComponents = (slot: string, newComponents: ComponentRecord[]) => {
    if (!components.value.get(slot)) {
      components.value.set(slot, []);
    }
    components.value.get(slot)!.push(...newComponents);
  };

  const merge = (newComponents: Map<string, ComponentRecord[]>) => {
    components.value = new Map([...components.value, ...newComponents]);
  };

  return {
    components,
    addComponents,
    merge,
  };
});
