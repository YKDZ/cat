<script setup lang="ts">
import type { Token } from "@cat/plugin-core";

import { storeToRefs } from "pinia";

import TokenViewer from "@/app/components/editor/TokenViewer.vue";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

const { element, sourceTokens } = storeToRefs(useEditorTableStore());
const { languageToId } = storeToRefs(useEditorContextStore());

const handleUpdate = (tokens: Token[]) => {
  sourceTokens.value = tokens;
};
</script>

<template>
  <TokenViewer
    v-if="element"
    :text="element.value"
    :element-id="element.id"
    :translation-language-id="languageToId ?? undefined"
    @update="handleUpdate"
  />
</template>
