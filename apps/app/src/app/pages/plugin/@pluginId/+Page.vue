<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { computed, ref } from "vue";
import PluginUserConfigs from "@/app/components/PluginUserConfigs.vue";
import { usePageContext } from "vike-vue/usePageContext";
import { usePluginStore } from "@/app/stores/plugin";
import type { Plugin } from "@cat/shared";
import { storeToRefs } from "pinia";

const { pluginId } = usePageContext().routeParams;
const { plugins } = storeToRefs(usePluginStore());

const plugin = computed<Plugin | null>(() => {
  return plugins.value.find((plugin) => plugin.id === pluginId) ?? null;
});
</script>

<template>
  <PluginUserConfigs v-if="plugin" :configs="plugin.Configs!" />
</template>
