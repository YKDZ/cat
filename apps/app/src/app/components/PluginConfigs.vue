<script setup lang="ts">
import { PluginConfig } from "@cat/shared";
import PluginConfigSwitcher from "./PluginConfigSwitcher.vue";

const props = defineProps<{
  configs: PluginConfig[];
}>();
</script>

<template>
  <PluginConfigSwitcher v-for="config in configs" :key="config.id" :config />
</template>
