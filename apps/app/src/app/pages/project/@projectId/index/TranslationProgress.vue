<script setup lang="ts">
import { computed } from "vue";
import { toShortFixed } from "@cat/shared/utils";
import type { ProgressBarLine } from "@/app/components/progress/bar/index.ts";
import ProgressBar from "@/app/components/progress/bar/ProgressBar.vue";
import type { Language } from "@cat/shared/schema/drizzle/misc";
import type { Project } from "@cat/shared/schema/drizzle/project";
import { orpc } from "@/server/orpc";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import { useI18n } from "vue-i18n";
import Dot from "@/app/components/Dot.vue";
import { useQuery } from "@pinia/colada";

const props = defineProps<{
  project: Pick<Project, "id">;
  language: Pick<Language, "id">;
}>();

const { t } = useI18n();

const { state: elementAmountState } = useQuery({
  key: ["elementAmount", props.project.id],
  placeholderData: 0,
  query: () =>
    orpc.project.countElement({
      projectId: props.project.id,
    }),
  enabled: !import.meta.env.SSR,
});

const { state: translatedElementAmountState } = useQuery({
  key: ["translatedElementAmount", props.project.id, props.language.id],
  placeholderData: 0,
  query: () =>
    orpc.project.countElement({
      projectId: props.project.id,
      isTranslated: true,
      languageId: props.language.id,
    }),
  enabled: !import.meta.env.SSR,
});

const { state: approvedElementAmountState } = useQuery({
  key: ["approvedElementAmount", props.project.id, props.language.id],
  placeholderData: 0,
  query: () =>
    orpc.project.countElement({
      projectId: props.project.id,
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
      class="text-xs px-3 py-1 rounded-sm bg-muted flex gap-0.5 w-36 items-center justify-center text-muted-foreground"
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
