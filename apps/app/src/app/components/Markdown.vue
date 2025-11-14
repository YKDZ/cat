<script setup lang="ts">
import { computed } from "vue";
import { setOptions, marked } from "marked";

const props = withDefaults(
  defineProps<{
    content: string;
    size?: "sm" | "base" | "lg" | "xl" | "2xl";
  }>(),
  {
    size: "base",
  },
);

setOptions({
  breaks: true,
});

const compiled = computed(() => marked(props.content));

const prose = computed(() => {
  switch (props.size) {
    case "sm":
      return "prose-sm";
    case "base":
      return "prose";
    case "lg":
      return "prose-lg";
    case "xl":
      return "prose-xl";
    case "2xl":
      return "prose-2xl";
    default:
      return "prose";
  }
});
</script>

<template>
  <div :class="prose" v-html="compiled" />
</template>
