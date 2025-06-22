<script setup lang="ts">
import PluginDeleteBtn from "@/app/components/PluginDeleteBtn.vue";
import PluginGlobalConfigs from "@/app/components/PluginGlobalConfigs.vue";
import { usePluginStore } from "@/app/stores/plugin";
import type { Plugin } from "@cat/shared";
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { computed } from "vue";

const { pluginId } = usePageContext().routeParams;
const { plugins } = storeToRefs(usePluginStore());

const plugin = computed<Plugin | null>(() => {
  return plugins.value.find((plugin) => plugin.id === pluginId) ?? null;
});
</script>

<template>
  <PluginGlobalConfigs v-if="plugin" :configs="plugin.Configs!" />
  <PluginDeleteBtn v-if="plugin" :id="plugin.id" />
</template>
