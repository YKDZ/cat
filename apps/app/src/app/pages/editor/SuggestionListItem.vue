<script setup lang="ts">
import { storeToRefs } from "pinia";
import TokenViewer from "@/app/components/editor/TokenViewer.vue";
import { useHotKeys } from "@/app/utils/magic-keys.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { computed } from "vue";
import type { TranslationSuggestion } from "@cat/plugin-core";

const { replace } = useEditorTableStore();
const { document } = storeToRefs(useEditorContextStore());

const props = defineProps<{
  suggestion: TranslationSuggestion;
  index: number;
}>();

const tagLabel = computed(() => {
  return null;
});

const handleCopy = () => {
  replace(props.suggestion.translation);
};

useHotKeys(`S+${props.index + 1}`, handleCopy);
</script>

<template>
  <div class="flex flex-col gap-1 px-3 py-2">
    <button class="text-wrapcursor-pointer text-start" @click="handleCopy">
      <TokenViewer v-if="document" :text="suggestion.translation" />
    </button>
    <div class="flex items-center gap-1 text-sm text-foreground">
      <span
        v-if="tagLabel"
        class="rounded-sm bg-violet-100 px-1 py-px text-xs text-violet-700"
      >
        {{ tagLabel }}
      </span>
    </div>
  </div>
</template>
