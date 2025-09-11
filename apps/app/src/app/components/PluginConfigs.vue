<script setup lang="ts">
import type { PluginConfig } from "@cat/shared/schema/prisma/plugin";
import PluginConfigForm from "./PluginConfigForm.vue";
import type { ScopeType } from "@cat/db";

const props = defineProps<{
  configs: PluginConfig[];
  scopeType: ScopeType;
  scopeId: string;
}>();
</script>

<template>
  <div class="flex flex-col gap-1">
    <PluginConfigForm
      v-for="config in configs"
      :key="config.id"
      :config
      :scope-type
      :scope-id
    />
  </div>
</template>
