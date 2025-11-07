<script setup lang="ts">
import EditorElementTranslations from "@/app/components/EditorElementTranslations.vue";
import EditorMemories from "@/app/components/EditorMemories.vue";
import EditorOriginElement from "@/app/components/EditorOriginElement.vue";
import EditorSuggestions from "@/app/components/EditorSuggestions.vue";
import EditorTerms from "@/app/components/EditorTerms.vue";
import EditorToolbar from "@/app/components/EditorToolbar.vue";
import EditorTranslateInput from "@/app/components/EditorTranslateInput.vue";
import { Separator } from "@/app/components/ui/separator";
</script>

<template>
  <EditorOriginElement />
  <Separator />
  <EditorTranslateInput />
  <EditorToolbar />
  <EditorElementTranslations />
  <div class="mt-3 gap-1 w-full grid grid-cols-3">
    <EditorSuggestions />
    <EditorMemories />
    <EditorTerms />
  </div>
</template>
