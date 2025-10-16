<script setup lang="ts">
import type { FlowItem } from "./index.ts";

const props = defineProps<{
  items: FlowItem[];
  onProgressChange?: (from: number, to: number) => number;
}>();

const progress = defineModel("progress", {
  type: Number,
  default: 0,
  set: (v) =>
    props.onProgressChange ? props.onProgressChange(progress.value, v) : v,
});
</script>

<template>
  <div class="inline select-none">
    <div
      v-for="(item, index) in items"
      :key="item.content"
      class="inline-flex items-center justify-center"
      @click="progress = index"
    >
      <span
        :class="{
          'underline underline-offset-4 underline-solid underline-black':
            index === progress,
          'text-highlight-content cursor-pointer hover:underline underline-offset-4 underline-solid underline-highlight-content':
            index !== progress,
        }"
        class="inline-flex items-center"
      >
        <span
          :class="
            progress > index
              ? `icon-[mdi--check-circle-outline]`
              : item.icon && item.icon.length > 0
                ? item.icon
                : `icon-[mdi--numeric-]${index + 1}-circle-outline`
          "
          class="inline-block"
        />
        {{ item.content }}</span
      >
      <span
        v-if="index !== items.length - 1"
        class="icon-[mdi--arrow-right-bold] mx-1 inline"
      />
    </div>
  </div>
</template>
