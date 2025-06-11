<script setup lang="ts">
import type { Unsubscribable } from "@trpc/server/observable";
import { storeToRefs } from "pinia";
import { watch } from "vue";
import { useEditorStore } from "../stores/editor";
import { useToastStore } from "../stores/toast";
import type { TranslationSuggestion } from "@cat/shared";
import { trpc } from "@/server/trpc/client";
import TextTagger from "./tagger/TextTagger.vue";

const { info, trpcWarn } = useToastStore();
const { replace } = useEditorStore();
const { elementId, languageToId, suggestions, document } =
  storeToRefs(useEditorStore());

const handleCopy = (suggestion: TranslationSuggestion) => {
  if (suggestion.status !== "SUCCESS") return;

  replace(suggestion.value);
  info(`成功复制来自 ${suggestion.from} 的翻译`);
};

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
  <div
    v-for="suggestion in suggestions"
    :key="suggestion.value"
    class="px-3 py-2 flex flex-col gap-1"
    :class="{
      'hover:bg-highlight-darker': suggestion.status === 'SUCCESS',
      'hover:bg-red-100': suggestion.status === 'ERROR',
    }"
  >
    <button
      class="text-start text-wrap"
      :class="{
        'cursor-pointer': suggestion.status === 'SUCCESS',
      }"
      @click="handleCopy(suggestion)"
    >
      <TextTagger v-if="document" :text="suggestion.value" />
    </button>
    <div class="text-sm text-highlight-content">{{ suggestion.from }}</div>
  </div>
  <div v-if="suggestions.length === 0" class="px-3 py-2 flex flex-col gap-1">
    还没有可用的翻译建议
  </div>
</template>
