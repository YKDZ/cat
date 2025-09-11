<script setup lang="ts">
import PluginConfigs from "@/app/components/PluginConfigs.vue";
import PluginDeleteBtn from "@/app/components/PluginDeleteBtn.vue";
import { usePluginStore } from "@/app/stores/plugin";
import type { Plugin, PluginConfig } from "@cat/shared/schema/prisma/plugin";
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
  <PluginConfigs
    v-if="plugin"
    :configs="plugin.Configs! as PluginConfig[]"
    scope-type="GLOBAL"
    scope-id=""
  />
  <PluginDeleteBtn v-if="plugin" :id="plugin.id" />
</template>
