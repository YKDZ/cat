<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted, ref, watch } from "vue";
import TextTagger from "./tagger/TextTagger.vue";
import type { PartData } from "./tagger/index.ts";
import { useEditorStore } from "@/app/stores/editor.ts";

const {
  translationValue,
  document,
  inputTextareaEl,
  originDivEl,
  translationParts,
} = storeToRefs(useEditorStore());

const topHeight = ref(originDivEl.value?.clientHeight);

watch(
  () => originDivEl.value?.clientHeight,
  (to) => (topHeight.value = to),
);

onMounted(() => {
  if (inputTextareaEl.value) {
    inputTextareaEl.value.focus();
  }
});

const handleUpdate = (from: PartData[] | undefined, to: PartData[]) => {
  translationParts.value = to;
};
</script>

<template>
  <TextTagger
    v-if="document"
    :text="translationValue"
    interactable
    @update="handleUpdate"
  />
</template>
