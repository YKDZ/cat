<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import PluginConfig from "@/app/components/PluginConfig.vue";
import PluginDeleteBtn from "@/app/components/PluginDeleteBtn.vue";

const { plugin } = useData<Data>();
</script>

<template>
  <PluginConfig
    v-if="plugin.Config"
    :config="plugin.Config"
    scope-type="GLOBAL"
    scope-id=""
  />
  <PluginDeleteBtn v-if="plugin" :id="plugin.id" />
</template>
