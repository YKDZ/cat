<script setup lang="ts">
import type { ContentNode } from "@cat/shared";
import type { Language } from "@cat/shared";

import { toShortFixed } from "@cat/shared";
import { useQuery } from "@pinia/colada";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import type { ProgressBarLine } from "@/components/progress/bar/index.ts";

import TextTooltip from "@/components/tooltip/TextTooltip.vue";
import { orpc } from "@/rpc/orpc";

import Dot from "./Dot.vue";
import ProgressBar from "./progress/bar/ProgressBar.vue";

const { t } = useI18n();

const props = defineProps<{
  document: Pick<ContentNode, "id" | "projectId">;
  language: Pick<Language, "id">;
}>();

const baseScope = computed(() => ({
  projectId: props.document.projectId,
  languageToId: props.language.id,
  contentNodeIds: [props.document.id],
  searchQuery: "",
  statusFilter: "all" as const,
  page: 1,
  pageSize: 16,
}));

const { state: elementAmountState } = useQuery({
  key: () => ["editor-elementAmount", baseScope.value],
  placeholderData: 0,
  query: () => orpc.editor.countElements(baseScope.value),
  enabled: !import.meta.env.SSR,
});

const { state: translatedElementAmountState } = useQuery({
  key: () => ["editor-translatedElementAmount", baseScope.value],
  placeholderData: 0,
  query: () =>
    orpc.editor.countElements({
      ...baseScope.value,
      statusFilter: "translated",
    }),
  enabled: !import.meta.env.SSR,
});

const { state: approvedElementAmountState } = useQuery({
  key: () => ["editor-approvedElementAmount", baseScope.value],
  placeholderData: 0,
  query: () =>
    orpc.editor.countElements({
      ...baseScope.value,
      statusFilter: "approved",
    }),
  enabled: !import.meta.env.SSR,
});

const progressBarLines = computed<ProgressBarLine[]>(() => {
  const total = elementAmountState.value.data ?? 0;
  const translated = translatedElementAmountState.value.data ?? 0;
  const approved = approvedElementAmountState.value.data ?? 0;

  return [
    {
      color: "#5B89C6",
      progress: total > 0 ? translated / total : 0,
    },
    {
      color: "#38C800",
      progress: total > 0 ? approved / total : 0,
    },
  ];
});
</script>

<template>
  <div class="flex items-center gap-2">
    <ProgressBar :lines="progressBarLines" />
    <div
      class="flex w-36 items-center justify-center gap-0.5 rounded-sm bg-muted px-3 py-1 text-xs text-muted-foreground"
    >
      <TextTooltip :tooltip="t('翻译进度')">
        <span v-if="progressBarLines[0]"
          >{{ toShortFixed(progressBarLines[0].progress * 100) }}%</span
        >
      </TextTooltip>
      <Dot class="color-foreground" />
      <TextTooltip :tooltip="t('批准进度')">
        <span v-if="progressBarLines[1]"
          >{{ toShortFixed(progressBarLines[1].progress * 100) }}%</span
        >
      </TextTooltip>
    </div>
  </div>
</template>
