<script setup lang="ts">
import { computed } from "vue";
import { toShortFixed } from "@cat/shared/utils";
import { useI18n } from "vue-i18n";
import Dot from "./Dot.vue";
import ProgressBar from "./progress/bar/ProgressBar.vue";
import type { ProgressBarLine } from "@/app/components/progress/bar/index.ts";
import { orpc } from "@/server/orpc";
import type { Document } from "@cat/shared/schema/drizzle/document";
import type { Language } from "@cat/shared/schema/drizzle/misc";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import { useQuery } from "@pinia/colada";

const { t } = useI18n();

const props = defineProps<{
  document: Pick<Document, "id">;
  language: Pick<Language, "id">;
}>();

const { state: elementAmountState } = useQuery({
  key: ["elementAmount", props.document.id],
  placeholderData: 0,
  query: () =>
    orpc.document.countElement({
      documentId: props.document.id,
    }),
  enabled: !import.meta.env.SSR,
});

const { state: translatedElementAmountState } = useQuery({
  key: ["translatedElementAmount", props.document.id, props.language.id],
  placeholderData: 0,
  query: () =>
    orpc.document.countElement({
      documentId: props.document.id,
      isTranslated: true,
      languageId: props.language.id,
    }),
  enabled: !import.meta.env.SSR,
});

const { state: approvedElementAmountState } = useQuery({
  key: ["approvedElementAmount", props.document.id, props.language.id],
  placeholderData: 0,
  query: () =>
    orpc.document.countElement({
      documentId: props.document.id,
      isTranslated: true,
      isApproved: true,
      languageId: props.language.id,
    }),
  enabled: !import.meta.env.SSR,
});

const progressBarLines = computed<ProgressBarLine[]>(() => {
  return [
    {
      color: "#5B89C6",
      progress:
        (translatedElementAmountState.value.data ?? 0) /
        ((elementAmountState.value.data ?? 0) || 1),
    },
    {
      color: "#38C800",
      progress:
        (approvedElementAmountState.value.data ?? 0) /
          (elementAmountState.value.data ?? 0) || 0,
    },
  ];
});
</script>

<template>
  <div class="flex gap-2 items-center">
    <ProgressBar :lines="progressBarLines" />
    <div
      class="text-xs px-3 py-1 rounded-sm bg-muted text-muted-foreground flex gap-0.5 w-36 items-center justify-center"
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
