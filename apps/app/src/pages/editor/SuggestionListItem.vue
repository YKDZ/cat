<script setup lang="ts">
import type { TranslationSuggestion } from "@cat/shared";

import { Skeleton } from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import TokenViewer from "@/components/editor/TokenViewer.vue";
import { orpc } from "@/rpc/orpc";
import { useEditorContextStore } from "@/stores/editor/context.ts";
import { useEditorTableStore } from "@/stores/editor/table.ts";
import { useProjectWriteCapabilityStore } from "@/stores/write-capability";
import { useHotKeys } from "@/utils/magic-keys.ts";

const { replace } = useEditorTableStore();
const { project } = storeToRefs(useEditorContextStore());
const { t } = useI18n();
const writeCapability = useProjectWriteCapabilityStore();
const { canWrite, disabledReason } = storeToRefs(writeCapability);

/**
 * Props for a suggestion list item.
 */
const props = defineProps<{
  /**
   * Current suggestion data.
   */
  suggestion: TranslationSuggestion;

  /**
   * Zero-based index of the current suggestion in the list.
   */
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
  if (!canWrite.value) return;
  replace(props.suggestion.translation);
};

useHotKeys(`S+${props.index + 1}`, handleCopy, { enabled: canWrite });
</script>

<template>
  <div class="flex flex-col gap-1 px-3 py-2">
    <button
      class="cursor-pointer text-start text-wrap disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="!canWrite"
      :title="disabledReason ? t(disabledReason) : undefined"
      @click="handleCopy"
    >
      <TokenViewer v-if="project" :text="suggestion.translation" />
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
