<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { provide } from "vue";
import type { Data } from "./+data.ts";
import PluginConfig from "@/app/components/PluginConfig.vue";
import PluginDeleteBtn from "@/app/components/PluginDeleteBtn.vue";
import { pluginKey } from "@/app/utils/provide.ts";

const { plugin } = useData<Data>();

provide(pluginKey, plugin);
</script>

<template>
  <PluginConfig
    v-if="plugin && plugin.Config"
    :config="plugin.Config"
    scope-type="GLOBAL"
    scope-id=""
  />
  <PluginDeleteBtn v-if="plugin" :id="plugin.id" />
</template>
