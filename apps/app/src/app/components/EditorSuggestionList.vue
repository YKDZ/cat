<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import type { Unsubscribable } from "@trpc/server/observable";
import { storeToRefs } from "pinia";
import { watch } from "vue";
import { useEditorStore } from "../stores/editor";
import { useToastStore } from "../stores/toast";
import EditorSuggestionListItem from "./EditorSuggestionListItem.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const { trpcWarn } = useToastStore();
const { elementId, languageToId, suggestions } = storeToRefs(useEditorStore());

let suggestionSub: Unsubscribable;

const load = () => {
  if (!elementId.value || !languageToId.value) return;
  if (suggestionSub) {
    suggestionSub.unsubscribe();
    suggestions.value = [];
  }

  suggestionSub = trpc.suggestion.onNew.subscribe(
    {
      elementId: elementId.value,
      languageId: languageToId.value,
    },
    {
      onData: ({ id, data }) => {
        suggestions.value.push(data);
      },
      onError: trpcWarn,
    },
  );
};

watch(elementId, load, { immediate: true });
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
