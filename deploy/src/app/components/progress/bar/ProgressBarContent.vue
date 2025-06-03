<script setup lang="ts">
import { computed } from "vue";
import { ProgressBarLine } from ".";

const props = defineProps<{
  line: ProgressBarLine;
  width: number;
  height: number;
}>();

const width = computed(() => {
  return props.width * props.line.progress;
});
</script>

<template>
  <div
    class="left-0 top-0 absolute"
    :style="{
      width: width + 'px',
      height: height + 'px',
      backgroundColor: line.color,
    }"
  />
</template>
