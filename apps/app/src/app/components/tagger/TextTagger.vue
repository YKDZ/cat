<script setup lang="ts">
import { computed, watch } from "vue";
import Empty from "./Empty.vue";
import Part from "./Part.vue";
import type { PartData } from "./index.ts";
import { clippers, recursiveSplit } from "./index.ts";

const props = withDefaults(
  defineProps<{
    text: string;
    interactive?: boolean;
  }>(),
  {
    interactive: false,
  },
);

const emits = defineEmits<{
  (e: "update", from: PartData[] | undefined, to: PartData[]): void;
}>();

const partsData = computed<PartData[]>(() => {
  const parts = recursiveSplit(props.text, clippers.value);
  return parts;
});

watch(partsData, (to, from) => emits("update", from, to), { immediate: true });
</script>

<template>
  <div
    class="block select-text whitespace-pre-wrap wrap-break-words text-start"
  >
    <Empty v-if="text.length === 0" />
    <Part
      v-for="part in partsData"
      :key="part.index + part.text"
      :part
      :interactive
    />
  </div>
</template>
