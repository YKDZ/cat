<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import EditorSuggestionListItem from "./EditorSuggestionListItem.vue";
import { useEditorSuggestionStore } from "@/app/stores/editor/suggestion.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { watchClient } from "@/app/utils/vue.ts";

const { t } = useI18n();

const { suggestions } = storeToRefs(useEditorSuggestionStore());
const { elementId } = storeToRefs(useEditorTableStore());
const { subSuggestions } = useEditorSuggestionStore();

watchClient(elementId, subSuggestions, { immediate: true });
</script>

<template>
  <EditorSuggestionListItem
    v-for="(suggestion, index) in suggestions"
    :key="suggestion.value"
    :suggestion
    :index
  />
  <div v-if="suggestions.length === 0" class="px-3 py-2 flex flex-col gap-1">
    {{ t("还没有可用的翻译建议") }}
  </div>
</template>
