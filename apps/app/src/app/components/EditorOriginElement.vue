<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import EditorTranslatableElementMeta from "./EditorTranslatableElementMeta.vue";
import EditorOriginElementValue from "./EditorOriginElementValue.vue";

const { originDivEl } = storeToRefs(useEditorStore());
</script>

<template>
  <div
    ref="originDivEl"
    class="px-5 pt-4 border-b-1 bg-highlight flex flex-col h-fit min-h-34 w-full relative -mb-2"
  >
    <EditorOriginElementValue />
    <EditorTranslatableElementMeta />
  </div>
</template>
