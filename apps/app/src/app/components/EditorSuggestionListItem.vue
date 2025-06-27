<script setup lang="ts">
import type { TranslationSuggestion } from "@cat/shared";
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import { useToastStore } from "../stores/toast";
import TextTagger from "./tagger/TextTagger.vue";
import { useHotKeys } from "../utils/magic-keys";

const { info } = useToastStore();
const { replace } = useEditorStore();
const { document } = storeToRefs(useEditorStore());

const props = defineProps<{
  suggestion: TranslationSuggestion;
  index: number;
}>();

const handleCopy = () => {
  if (props.suggestion.status !== "SUCCESS") return;

  replace(props.suggestion.value);
  info(`成功复制来自 ${props.suggestion.from} 的翻译`);
};

useHotKeys(`S+${props.index + 1}`, handleCopy);
</script>

<template>
  <div
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
      @click="handleCopy"
    >
      <TextTagger v-if="document" :text="suggestion.value" />
    </button>
    <div class="text-sm text-highlight-content">{{ suggestion.from }}</div>
  </div>
</template>
