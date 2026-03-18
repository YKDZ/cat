<script setup lang="ts">
import type { ProgressBarLine } from "./index";

import ProgressBarContent from "./ProgressBarContent.vue";

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
    class="relative inline-block overflow-hidden rounded-xs bg-muted"
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
