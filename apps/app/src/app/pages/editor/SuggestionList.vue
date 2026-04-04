<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import { useEditorSuggestionStore } from "@/app/stores/editor/suggestion.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { watchClient } from "@/app/utils/vue.ts";

import SuggestionListItem from "./SuggestionListItem.vue";

const { t } = useI18n();

const { suggestions } = storeToRefs(useEditorSuggestionStore());
const { elementId } = storeToRefs(useEditorTableStore());
const { subSuggestions, unsubscribe } = useEditorSuggestionStore();

watchClient(
  elementId,
  async () => {
    await unsubscribe();
    await subSuggestions();
  },
  { immediate: true },
);
</script>

<template>
  <SuggestionListItem
    v-for="(suggestion, index) in suggestions"
    :key="suggestion.translation"
    :suggestion
    :index
  />
  <div v-if="suggestions.length === 0" class="flex flex-col gap-1 px-3 py-2">
    {{ t("还没有可用的翻译建议") }}
  </div>
</template>
