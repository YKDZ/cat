<script setup lang="ts">
import type { Plugin } from "@cat/shared";
import PluginTags from "./PluginTags.vue";
import { computed, onMounted, ref } from "vue";
import { useEventListener } from "@vueuse/core";
import { navigate } from "vike/client/router";

const props = defineProps<{
  plugin: Plugin;
}>();

const iconImgEl = ref<HTMLImageElement>();
const isIconLoaded = ref(false);

const handleNav = () => {
  navigate(`/plugin/${props.plugin.id}`);
};

const simpleName = computed(() => {
  return props.plugin.name.replace("@cat-plugin/", "");
});

onMounted(() => {
  useEventListener(iconImgEl.value, "load", () => (isIconLoaded.value = true));
});
</script>

<template>
  <div
    class="text-highlight-content p-4 rounded-md bg-highlight-darker flex flex-col gap-2 cursor-pointer hover:scale-101"
    @click="handleNav"
  >
    <div class="flex gap-3 items-center">
      <!-- Icon -->
      <div>
        <img
          v-show="plugin.iconURL && isIconLoaded"
          ref="iconImgEl"
          :src="plugin.iconURL ?? ``"
          class="rounded-md max-h-12 max-h-12 min-h-12 min-w-12 aspect-ratio-square object-cover"
        />
        <span
          v-if="!isIconLoaded"
          class="text-3xl text-base-content rounded-md bg-base inline-flex h-12 w-12 aspect-ratio-square select-none items-center justify-center"
          >{{ simpleName.charAt(0).toUpperCase() }}</span
        >
      </div>
      <!-- Text & base tag -->
      <div class="flex flex-col gap-1 max-w-80% justify-start justify-between">
        <h3
          class="text-lg text-highlight-content-darker font-bold text-nowrap text-ellipsis overflow-hidden"
        >
          {{ simpleName }}
        </h3>
        <div
          class="text-xs text-highlight-content flex gap-1 select-none text-nowrap items-center"
        >
          <span
            v-if="plugin.isExternal"
            class="px-2 py-1 rounded-sm bg-highlight-darkest"
            >内部插件</span
          >
          <span
            v-if="plugin.enabled"
            class="px-2 py-1 rounded-sm bg-highlight-darkest"
            >已安装</span
          >
        </div>
      </div>
    </div>
    <p>{{ plugin.overview }}</p>
    <PluginTags :tags="plugin.Tags ?? []" class="mt-auto" />
  </div>
</template>
