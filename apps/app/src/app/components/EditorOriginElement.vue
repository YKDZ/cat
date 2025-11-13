<script setup lang="ts">
import { storeToRefs } from "pinia";
import EditorTranslatableElementMeta from "./EditorTranslatableElementMeta.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import EditorOriginElementValue from "@/app/components/EditorOriginElementValue.vue";

const { originDivEl } = storeToRefs(useEditorTableStore());
</script>

<template>
  <div
    ref="originDivEl"
    class="px-5 pt-4 bg-background min-h-34 grid grid-cols-3"
  >
    <EditorOriginElementValue class="col-span-2 min-w-0" />
    <EditorTranslatableElementMeta class="col-span-1" />
  </div>
</template>
