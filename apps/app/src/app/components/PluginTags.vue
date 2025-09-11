<script setup lang="ts">
import type { PluginTag } from "@cat/shared/schema/prisma/plugin";
import PluginTagItem from "./PluginTagItem.vue";

const props = defineProps<{
  tags: PluginTag[];
}>();
</script>

<template>
  <div class="flex gap-1">
    <PluginTagItem v-for="tag in tags" :key="tag.id" :tag />
  </div>
</template>
