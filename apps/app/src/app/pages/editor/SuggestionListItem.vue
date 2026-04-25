<script setup lang="ts">
import type { TranslationSuggestion } from "@cat/shared";

import { Skeleton } from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { storeToRefs } from "pinia";
import { computed } from "vue";

import TokenViewer from "@/app/components/editor/TokenViewer.vue";
import { orpc } from "@/app/rpc/orpc";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useHotKeys } from "@/app/utils/magic-keys.ts";

const { replace } = useEditorTableStore();
const { document } = storeToRefs(useEditorContextStore());

const props = defineProps<{
  suggestion: TranslationSuggestion;
  index: number;
}>();

const { state } = useQuery({
  key: ["reactions", props.suggestion.advisorId ?? "noAdvisor"],
  placeholderData: {
    id: -1,
    name: "",
  },
  query: () =>
    orpc.plugin.getTranslationAdvisor({
      advisorId: props.suggestion.advisorId!,
    }),
  enabled: !import.meta.env.SSR && !!props.suggestion.advisorId,
});

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
    <span v-if="state.status === 'success'">{{ state.data?.name }}</span>
    <Skeleton v-else class="h-2 w-5" />
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
