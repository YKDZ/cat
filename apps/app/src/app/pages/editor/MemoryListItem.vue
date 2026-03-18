<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import type { MemorySuggestion } from "@cat/shared/schema/misc";

import { toShortFixed } from "@cat/shared/utils";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import TokenViewer from "@/app/components/editor/TokenViewer.vue";
import UserAvatar from "@/app/components/UserAvatar.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useHotKeys } from "@/app/utils/magic-keys.ts";
import { orpc } from "@/server/orpc";

const { replace } = useEditorTableStore();
const { t } = useI18n();


const props = defineProps<{
  memorySuggestion: MemorySuggestion;
  index: number;
}>();


const displayTranslation = computed(
  () =>
    props.memorySuggestion.adaptedTranslation ??
    props.memorySuggestion.translation,
);


const handleCopy = () => {
  replace(displayTranslation.value);
};


const memory = ref<Memory | null>(null);


useHotKeys(`M+${props.index + 1}`, handleCopy);


onMounted(async () => {
  memory.value = await orpc.memory.get({
    memoryId: props.memorySuggestion.memoryId,
  });
});
</script>

<template>
  <div class="flex flex-col gap-1 px-3 py-2 hover:bg-background">
    <button class="cursor-pointer text-start text-wrap" @click="handleCopy">
      <TokenViewer :text="displayTranslation" />
    </button>
    <div class="flex items-center gap-2 text-sm text-foreground">
      <span>{{
        t("{confidence}%", {
          confidence: toShortFixed(memorySuggestion.confidence * 100, 2),
        })
      }}</span>
      <span
        v-if="memorySuggestion.adaptationMethod === 'token-replaced'"
        class="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300"
      >
        {{ t("占位符替换") }}
      </span>
      <UserAvatar :user-id="memorySuggestion.creatorId" with-name :size="16" />
      <span>{{ memory?.name ?? props.memorySuggestion.memoryId }}</span>
    </div>
  </div>
</template>
