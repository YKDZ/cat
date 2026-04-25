<script setup lang="ts">
import type { PluginConfig } from "@cat/shared";
import type { ScopeType } from "@cat/shared";

import PluginConfigForm from "./PluginConfigForm.vue";

defineProps<{
  config: PluginConfig;
  scopeType: ScopeType;
  scopeId: string;
}>();
</script>

<template>
  <PluginConfigForm :key="config.id" :config :scope-type :scope-id />
</template>
