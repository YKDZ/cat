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
  <div class="flex flex-col md:grid md:grid-cols-3">
    <EditorSuggestions />
    <EditorMemories />
    <EditorTerms />
  </div>
</template>
