<script setup lang="ts">
import type { Plugin } from "@cat/shared/schema/drizzle/plugin";
import type { ScopeType } from "@cat/shared/schema/enum";

import PluginListItem from "./PluginListItem.vue";

defineProps<{
  plugins: Plugin[];
  scopeType: ScopeType;
  scopeId: string;
  pathPrefix: string;
}>();
</script>

<template>
  <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
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
