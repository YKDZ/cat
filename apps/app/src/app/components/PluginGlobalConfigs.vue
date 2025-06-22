<script setup lang="ts">
import type { PluginConfig } from "@cat/shared";
import PluginGlobalConfigForm from "./PluginGlobalConfigForm.vue";

const props = defineProps<{
  configs: PluginConfig[];
}>();
</script>

<template>
  <div class="flex flex-col gap-1">
    <PluginGlobalConfigForm
      v-for="config in configs"
      :key="config.id"
      :config
    />
  </div>
</template>
