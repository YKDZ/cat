<script setup lang="ts">
import EditorElementTranslations from "@/app/components/EditorElementTranslations.vue";
import EditorMemories from "@/app/components/EditorMemories.vue";
import EditorOriginElement from "@/app/components/EditorOriginElement.vue";
import EditorSuggestions from "@/app/components/EditorSuggestions.vue";
import EditorTerms from "@/app/components/EditorTerms.vue";
import EditorToolbar from "@/app/components/EditorToolbar.vue";
import EditorTranslateInput from "@/app/components/EditorTranslateInput.vue";
</script>

<template>
  <EditorOriginElement />
  <EditorTranslateInput />
  <EditorToolbar />
  <EditorElementTranslations />
  <div class="mt-3 flex gap-1 w-full">
    <EditorSuggestions class="w-1/3" />
    <EditorMemories class="w-1/3" />
    <EditorTerms class="w-1/3" />
  </div>
</template>
