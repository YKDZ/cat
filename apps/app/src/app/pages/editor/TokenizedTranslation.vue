<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted } from "vue";
import TokenRenderer from "@/app/components/tokenizer/TokenRenderer.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import type { Token } from "@cat/plugin-core";

const { translationValue, inputTextareaEl, translationTokens } = storeToRefs(
  useEditorTableStore(),
);
const { document } = storeToRefs(useEditorContextStore());

const handleUpdate = (tokens: Token[]) => {
  translationTokens.value = tokens;
};

onMounted(() => {
  if (inputTextareaEl.value) {
    inputTextareaEl.value.focus();
  }
});
</script>

<template>
  <TokenRenderer
    v-if="document"
    :text="translationValue"
    interactable
    @update="handleUpdate"
  />
</template>
