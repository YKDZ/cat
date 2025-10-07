<script setup lang="ts">
import ProgressBarContent from "./ProgressBarContent.vue";
import type { ProgressBarLine } from "./index";

withDefaults(
  defineProps<{
    lines: ProgressBarLine[];
    width?: number;
    height?: number;
  }>(),
  {
    width: 144,
    height: 10,
  },
);
</script>

<template>
  <div
    class="rounded-xs bg-highlight-darkest inline-block relative overflow-hidden"
    :style="{
      width: width + 'px',
      height: height + 'px',
    }"
  >
    <ProgressBarContent
      v-for="(line, index) in lines"
      :key="line.color"
      :line
      :width
      :height
      :style="{
        zIndex: index,
      }"
    />
  </div>
</template>
