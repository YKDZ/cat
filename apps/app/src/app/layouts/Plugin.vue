<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import IndexHeader from "../components/IndexHeader.vue";
import IndexSidebar from "../components/IndexSidebar.vue";
import type { Plugin } from "@cat/shared";
import { storeToRefs } from "pinia";
import { provide, ref, watch } from "vue";
import { pluginKey } from "../utils/provide";
import { usePluginStore } from "../stores/plugin";

const ctx = usePageContext();

const plugin = ref<Plugin | null>(null);

provide(pluginKey, plugin);

const { plugins } = storeToRefs(usePluginStore());

watch(
  () => ctx.routeParams,
  () => {
    plugin.value =
      plugins.value.find(
        (project) => project.id === ctx.routeParams.pluginId,
      ) ?? null;
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <IndexHeader />
      <!-- Content -->
      <div class="p-4 flex flex-col gap-2">
        <slot />
      </div>
    </div>
  </div>
</template>
