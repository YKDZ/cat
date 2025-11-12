<script setup lang="ts">
import { storeToRefs } from "pinia";
import EditorTranslatableElementMeta from "./EditorTranslatableElementMeta.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import EditorOriginElementValue from "@/app/components/EditorOriginElementValue.vue";

const { originDivEl } = storeToRefs(useEditorTableStore());
</script>

<template>
  <div ref="originDivEl" class="px-5 pt-4 bg-background flex min-h-34 w-full">
    <EditorOriginElementValue class="w-2/3" />
    <EditorTranslatableElementMeta class="w-1/3" />
  </div>
</template>
