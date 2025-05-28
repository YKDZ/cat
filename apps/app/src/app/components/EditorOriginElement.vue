<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import EditorElementMeta from "./EditorElementMeta.vue";
import EditorTranslatableElementValue from "./EditorTranslatableElementValue.vue";

const { originDivEl } = storeToRefs(useEditorStore());
</script>

<template>
  <div
    ref="originDivEl"
    class="px-5 pt-4 border-b-1 bg-highlight flex flex-col h-fit min-h-34 w-full relative -mb-2"
  >
    <EditorTranslatableElementValue />
    <EditorElementMeta />
  </div>
</template>
