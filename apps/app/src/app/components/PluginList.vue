<script setup lang="ts">
import type { Plugin } from "@cat/shared";
import PluginListItem from "./PluginListItem.vue";

const props = defineProps<{
  plugins: Plugin[];
}>();
</script>

<template>
  <div class="gap-3 grid grid-cols-1 md:grid-cols-3">
    <PluginListItem v-for="plugin in plugins" :key="plugin.id" :plugin />
  </div>
</template>
