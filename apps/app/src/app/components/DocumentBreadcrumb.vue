<script setup lang="ts">
import type { Document } from "@cat/shared";
import { computed } from "vue";

const props = defineProps<{
  document: Document;
}>();

// TODO 文件名 -> 图标
const icon = computed(() => "i-mdi:file");
</script>

<template>
  <div class="flex items-center">
    <div class="text-lg font-bold flex gap-2 items-center">
      <span :class="icon" class="h-6 w-6 inline-block" /><span>{{
        document?.File?.originName
      }}</span>
    </div>
  </div>
</template>
