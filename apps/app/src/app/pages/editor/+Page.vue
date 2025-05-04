<script setup lang="ts">
import EditorElementTranslations from "@/app/components/EditorElementTranslations.vue";
import EditorMemories from "@/app/components/EditorMemories.vue";
import EditorOriginElement from "@/app/components/EditorOriginElement.vue";
import EditorSuggestions from "@/app/components/EditorSuggestions.vue";
import EditorToolbar from "@/app/components/EditorToolbar.vue";
import EditorTranslateInput from "@/app/components/EditorTranslateInput.vue";
</script>

<template>
  <EditorOriginElement />
  <EditorTranslateInput />
  <EditorToolbar />
  <EditorElementTranslations />
  <div class="mt-3 flex w-full">
    <EditorSuggestions class="w-1/2" />
    <EditorMemories class="w-1/2" />
  </div>
</template>
