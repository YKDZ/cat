<script setup lang="ts">
import type { PluginComponent as PluginComponentType } from "@cat/shared";
import { ref } from "vue";
import PluginComponent from "./PluginComponent.vue";

const props = defineProps<{
  id: string;
}>();

const components = ref<PluginComponentType[]>([
  {
    id: "test",
    entry: "dist/Test.mjs",
    mountOn: "index",
    pluginId: "component-test",
  },
]);
</script>

<template>
  <Suspense>
    <div>
      <PluginComponent
        v-for="component in components"
        :key="component.id"
        :component
      />
    </div>
  </Suspense>
</template>
