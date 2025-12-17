<script setup lang="ts">
import type { Plugin } from "@cat/shared/schema/drizzle/plugin";
import PluginListItem from "./PluginListItem.vue";
import type { ScopeType } from "@cat/shared/schema/drizzle/enum";

defineProps<{
  plugins: Plugin[];
  scopeType: ScopeType;
  scopeId: string;
  pathPrefix: string;
}>();
</script>

<template>
  <div class="gap-3 grid grid-cols-1 md:grid-cols-3">
    <PluginListItem
      v-for="plugin in plugins"
      :key="plugin.id"
      :plugin
      :scope-type
      :scope-id
      :path-prefix
    />
  </div>
</template>
