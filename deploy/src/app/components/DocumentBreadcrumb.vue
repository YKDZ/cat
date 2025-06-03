<script setup lang="ts">
import { Document } from "@cat/shared";
import { computed } from "vue";

const props = defineProps<{
  document: Document;
}>();

const icon = computed(() => props.document.File?.Type?.icon ?? "i-mdi:file");
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
