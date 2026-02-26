<script setup lang="ts">
import type { Document } from "@cat/shared/schema/drizzle/document";
import { computed } from "vue";

defineProps<{
  document: Pick<Document, "name">;
}>();

// TODO 文件名 -> 图标
const icon = computed(() => "icon-[mdi--file]");
</script>

<template>
  <div class="flex items-center">
    <div class="flex items-center gap-2 text-lg font-bold">
      <span :class="icon" class="inline-block h-6 w-6" /><span>{{
        document.name
      }}</span>
    </div>
  </div>
</template>
