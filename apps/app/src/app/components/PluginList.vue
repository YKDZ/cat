<script setup lang="ts">
import type {
  PluginTag,
  Plugin,
  PluginInstallation,
} from "@cat/shared/schema/prisma/plugin";
import PluginListItem from "./PluginListItem.vue";

defineProps<{
  plugins: (Plugin & {
    Installations: PluginInstallation[];
    Tags: PluginTag[];
  })[];
  pathPrefix: string;
}>();
</script>

<template>
  <div class="gap-3 grid grid-cols-1 md:grid-cols-3">
    <PluginListItem
      v-for="plugin in plugins"
      :key="plugin.id"
      :plugin
      :path-prefix
    />
  </div>
</template>
