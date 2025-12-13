<script setup lang="ts">
import type { PluginConfig } from "@cat/shared/schema/drizzle/plugin";
import PluginConfigForm from "./PluginConfigForm.vue";
import type { ScopeType } from "@cat/shared/schema/drizzle/enum";

defineProps<{
  config: PluginConfig;
  scopeType: ScopeType;
  scopeId: string;
}>();
</script>

<template>
  <PluginConfigForm :key="config.id" :config :scope-type :scope-id />
</template>
