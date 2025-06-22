<script setup lang="ts">
import type { PluginConfig } from "@cat/shared";
import PluginUserConfigForm from "./PluginUserConfigForm.vue";

const props = defineProps<{
  configs: PluginConfig[];
}>();
</script>

<template>
  <div class="flex flex-col gap-1">
    <PluginUserConfigForm v-for="config in configs" :key="config.id" :config />
  </div>
</template>
