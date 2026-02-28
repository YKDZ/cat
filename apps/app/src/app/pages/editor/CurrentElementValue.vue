<script setup lang="ts">
import { storeToRefs } from "pinia";
import TokenRenderer from "@/app/components/tokenizer/TokenRenderer.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import type { Token } from "@cat/plugin-core";
import { useEditorTermStore } from "@/app/stores/editor/term";

const { element, sourceTokens } = storeToRefs(useEditorTableStore());
const { termDataList } = storeToRefs(useEditorTermStore());

const handleUpdate = (tokens: Token[]) => {
  sourceTokens.value = tokens;
};
</script>

<template>
  <TokenRenderer
    v-if="element"
    :text="element.value"
    :terms="termDataList"
    interactable
    @update="handleUpdate"
  />
</template>
