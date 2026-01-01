<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted } from "vue";
import TextTagger from "@/app/components/tagger/TextTagger.vue";
import type { PartData } from "@/app/components/tagger/index.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";

const { translationValue, inputTextareaEl, translationParts } = storeToRefs(
  useEditorTableStore(),
);
const { document } = storeToRefs(useEditorContextStore());

const handleUpdate = (from: PartData[] | undefined, to: PartData[]) => {
  translationParts.value = to;
};

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
