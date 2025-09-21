<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted, ref } from "vue";
import TextTagger from "./tagger/TextTagger.vue";
import type { PartData } from "./tagger/index.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { syncRefWith } from "@/app/utils/vue.ts";

const { translationValue, inputTextareaEl, originDivEl, translationParts } =
  storeToRefs(useEditorTableStore());
const { document } = storeToRefs(useEditorContextStore());

const topHeight = ref<number>(0);

const handleUpdate = (from: PartData[] | undefined, to: PartData[]) => {
  translationParts.value = to;
};

syncRefWith(topHeight, () => originDivEl.value?.clientHeight);

onMounted(() => {
  if (inputTextareaEl.value) {
    inputTextareaEl.value.focus();
  }
});
</script>

<template>
  <TextTagger
    v-if="document"
    :text="translationValue"
    interactable
    @update="handleUpdate"
  />
</template>
