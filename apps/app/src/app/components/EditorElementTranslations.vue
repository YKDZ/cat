<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import EditorElementTranslation from "./EditorElementTranslation.vue";

const { translations } = storeToRefs(useEditorStore());
</script>

<template>
  <div class="flex flex-col gap-2">
    <h3 class="text-sm font-bold">所有翻译</h3>
    <div v-for="translation in translations" :key="translation.id">
      <EditorElementTranslation :translation="translation" />
    </div>
    <div
      v-if="translations.length === 0"
      class="px-3 py-2 flex gap-2 select-none"
    >
      还没有任何翻译
    </div>
  </div>
</template>
