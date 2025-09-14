<script setup lang="ts">
import { useI18n } from "vue-i18n";
import EditorSuggestionList from "./EditorSuggestionList.vue";

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-2">
    <h3 class="text-sm font-bold">{{ t("翻译建议") }}</h3>
    <EditorSuggestionList />
  </div>
</template>
