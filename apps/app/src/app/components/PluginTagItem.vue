<script setup lang="ts">
import type { PluginTag } from "@cat/shared";

const props = defineProps<{
  tag: PluginTag;
}>();
</script>

<template>
  <div
    class="text-sm text-highlight-content px-3 py-1 rounded-lg bg-highlight-darkest inline-flex"
  >
    {{ tag.name }}
  </div>
</template>
