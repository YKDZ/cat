<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.server.ts";
import PluginConfig from "@/app/components/PluginConfig.vue";
import PluginDeleteBtn from "@/app/components/PluginDeleteBtn.vue";

const { plugin } = useData<Data>();
</script>

<template>
  <PluginConfig
    v-if="plugin.PluginConfig"
    :config="plugin.PluginConfig"
    scope-type="GLOBAL"
    scope-id=""
  />
  <PluginDeleteBtn v-if="plugin" :id="plugin.id" />
</template>
