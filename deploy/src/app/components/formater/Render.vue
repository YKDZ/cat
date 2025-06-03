<script setup lang="ts">
import { computed, watch } from "vue";
import { clippers, PartData } from ".";
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

const partsData = computed(() => {
  const combinedPattern = clippers.value
    .map(({ splitter }) => `(?:${splitter.source})`)
    .join("|");
  const combined = new RegExp(`(${combinedPattern})`, "g");

  const results: PartData[] = [];
  let lastIndex = 0;
  let match;

  while ((match = combined.exec(props.text)) !== null) {
    const matchedText = match[0];
    const matchStart = match.index;
    const matchEnd = combined.lastIndex;

    if (matchStart > lastIndex) {
      results.push({
        index: matchStart,
        text: props.text.slice(lastIndex, matchStart),
        clipperId: null,
      });
    }

    let whichClipper = null;
    for (const clipper of clippers.value) {
      const exactRe = new RegExp(`^${clipper.splitter.source}$`);
      if (exactRe.test(matchedText)) {
        whichClipper = clipper;
        break;
      }
    }

    results.push({
      index: matchStart,
      text: matchedText,
      clipperId: whichClipper?.id ?? null,
    });

    lastIndex = matchEnd;
  }

  if (lastIndex < props.text.length) {
    results.push({
      index: lastIndex + 1,
      text: props.text.slice(lastIndex),
      clipperId: null,
    });
  }

  return results;
});

watch(partsData, (to, from) => emits("update", from, to), { immediate: true });
</script>

<template>
  <div class="inline-block">
    <Empty v-if="text.length === 0" />
    <Part
      v-for="part in partsData"
      :key="part.index + part.text"
      :part
      :interactable
    />
  </div>
</template>
