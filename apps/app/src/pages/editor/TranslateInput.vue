<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";

import TranslationEditor from "@/components/editor/TranslationEditor.vue";

const editorRef =
  useTemplateRef<InstanceType<typeof TranslationEditor>>("editorRef");

onMounted(() => {
  editorRef.value?.focus();
});
</script>

<template>
  <div
    class="bg-op-50 flex h-fit w-full max-w-full border-t bg-background backdrop-blur-sm"
  >
    <TranslationEditor ref="editorRef" class="w-full" />
  </div>
</template>
