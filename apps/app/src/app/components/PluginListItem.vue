<script setup lang="ts">
import type { Plugin } from "@cat/shared/schema/prisma/plugin";
import PluginTags from "./PluginTags.vue";
import { computed, ref } from "vue";
import { useEventListener } from "@vueuse/core";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{
  plugin: WithRequired<Plugin, "Installations">;
  pathPrefix: string;
}>();

const iconImgEl = ref<HTMLImageElement>();
const isIconLoaded = ref(false);

const handleNav = async () => {
  await navigate(`${props.pathPrefix}/${props.plugin.id}`);
};

const simpleName = computed(() => {
  return props.plugin.name.replace("@cat-plugin/", "");
});

useEventListener(iconImgEl.value, "load", () => (isIconLoaded.value = true));
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
            >{{ t("内部插件") }}</span
          >
          <span
            v-if="plugin.Installations.length > 0"
            class="px-2 py-1 rounded-sm bg-highlight-darkest"
            >{{ t("已安装") }}</span
          >
        </div>
      </div>
    </div>
    <p>{{ plugin.overview }}</p>
    <PluginTags :tags="plugin.Tags ?? []" class="mt-auto" />
  </div>
</template>
