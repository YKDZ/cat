<script setup lang="ts">
import { computed, watch } from "vue";
import type { PartData } from ".";
import { clippers, recursiveSplit } from ".";
import Empty from "./Empty.vue";
import Part from "./Part.vue";

const props = withDefaults(
  defineProps<{
    text: string;
    interactable?: boolean;
  }>(),
  {
    interactable: false,
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
  <div class="block whitespace-normal break-words">
    <Empty v-if="text.length === 0" />
    <Part
      v-for="part in partsData"
      :key="part.index + part.text"
      :part
      :interactable
    />
  </div>
</template>
