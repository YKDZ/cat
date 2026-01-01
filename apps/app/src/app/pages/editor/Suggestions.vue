<script setup lang="ts">
import { useI18n } from "vue-i18n";
import SuggestionList from "./SuggestionList.vue";

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-2 p-3 pb-0">
    <h3 class="text-sm font-bold">{{ t("翻译建议") }}</h3>
    <SuggestionList />
  </div>
</template>
