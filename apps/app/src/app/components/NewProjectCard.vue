<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps({
  title: {
    type: String,
    default: "",
  },
  subtitle: {
    type: String,
    default: "",
  },
  content: {
    type: String,
    default: "",
  },
  icon: {
    type: String,
    default: "",
  },
});

const parsedCardClasses = computed(() => {
  return [`bg-highlight hover:bg-highlight-darker`];
});
</script>

<template>
  <div
    class="p-4 rounded-lg flex flex-col max-w-80 cursor-pointer select-none shadow-lg active:shadow-none active:transform-translate-y-1"
    :class="parsedCardClasses"
  >
    <div class="text-lg font-bold flex gap-2 text-nowrap items-center">
      <div :class="icon" class="text-black h-4 w-4" />
      {{ title }}
    </div>
    <div class="text-xs text-nowrap">{{ subtitle }}</div>
    <div class="text-sm mt-2">{{ content }}</div>
  </div>
</template>
