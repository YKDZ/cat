<script setup lang="ts">
import { useData } from "vike-vue/useData";

import PluginConfig from "@/app/components/PluginConfig.vue";

import type { Data } from "./+data.server.ts";

const { config } = useData<Data>();
</script>

<template>
  <PluginConfig :config scope-type="GLOBAL" scope-id="" />
</template>
