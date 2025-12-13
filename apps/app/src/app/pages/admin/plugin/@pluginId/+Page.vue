<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.server.ts";
import PluginConfig from "@/app/components/PluginConfig.vue";

const { config } = useData<Data>();
</script>

<template>
  <PluginConfig :config scope-type="GLOBAL" scope-id="" />
</template>
