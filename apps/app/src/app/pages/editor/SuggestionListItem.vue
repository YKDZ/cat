<script setup lang="ts">
import type { TranslationSuggestion } from "@cat/shared/schema/misc";
import { storeToRefs } from "pinia";
import TextTagger from "@/app/components/tagger/TextTagger.vue";
import { useHotKeys } from "@/app/utils/magic-keys.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";

const { replace } = useEditorTableStore();
const { document } = storeToRefs(useEditorContextStore());

const props = defineProps<{
  suggestion: TranslationSuggestion;
  index: number;
}>();

const handleCopy = () => {
  if (props.suggestion.status !== "SUCCESS") return;

  replace(props.suggestion.value);
};

useHotKeys(`S+${props.index + 1}`, handleCopy);
</script>

<template>
  <div
    class="px-3 py-2 flex flex-col gap-1"
    :class="{
      'hover:bg-accent': suggestion.status === 'SUCCESS',
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
    <div class="text-sm text-foreground">{{ suggestion.from }}</div>
  </div>
</template>
