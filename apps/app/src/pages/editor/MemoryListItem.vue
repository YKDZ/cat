<script setup lang="ts">
import type { Memory } from "@cat/shared";
import type { MemorySuggestion } from "@cat/shared";

import { toShortFixed } from "@cat/shared";
import { Badge } from "@cat/ui";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import TokenViewer from "@/components/editor/TokenViewer.vue";
import UserAvatar from "@/components/UserAvatar.vue";
import { orpc } from "@/rpc/orpc";
import { useEditorTableStore } from "@/stores/editor/table.ts";
import { useHotKeys } from "@/utils/magic-keys.ts";

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

const evidenceBadges = computed(() =>
  props.memorySuggestion.evidences.map((evidence) => ({
    label: evidence.matchedVariantType
      ? `${evidence.channel}:${evidence.matchedVariantType}`
      : evidence.channel,
    title:
      evidence.note ??
      evidence.matchedVariantText ??
      evidence.matchedText ??
      undefined,
  })),
);

const debugNotes = computed(() => [
  ...new Set(
    props.memorySuggestion.evidences.flatMap((evidence) =>
      evidence.note ? [evidence.note] : [],
    ),
  ),
]);

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
      <Badge variant="outline">
        {{ t("占位符替换") }}
      </Badge>
      <UserAvatar :user-id="memorySuggestion.creatorId" with-name :size="16" />
      <span>{{ memory?.name ?? props.memorySuggestion.memoryId }}</span>
    </div>
    <div
      v-if="memorySuggestion.matchedText || evidenceBadges.length > 0"
      class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
    >
      <span v-if="memorySuggestion.matchedText">
        {{ t("命中文本：{text}", { text: memorySuggestion.matchedText }) }}
      </span>
      <Badge
        v-for="badge in evidenceBadges"
        :key="badge.label + badge.title"
        variant="outline"
        class="text-[10px]"
        :title="badge.title"
      >
        {{ badge.label }}
      </Badge>
    </div>
    <div
      v-if="debugNotes.length > 0"
      class="flex flex-col gap-1 text-xs text-muted-foreground"
    >
      <span v-for="note in debugNotes" :key="note">
        {{ note }}
      </span>
    </div>
  </div>
</template>
