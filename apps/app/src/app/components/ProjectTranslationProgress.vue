<script setup lang="ts">
import { computed } from "vue";
import { toShortFixed } from "@cat/shared/utils";
import type { ProgressBarLine } from "./progress/bar/index.ts";
import Dot from "./Dot.vue";
import ProgressBar from "@/app/components/progress/bar/ProgressBar.vue";
import type { Language } from "@cat/shared/schema/drizzle/misc";
import type { Project } from "@cat/shared/schema/drizzle/project";
import { trpc } from "@cat/app-api/trpc/client";
import { computedAsyncClient } from "@/app/utils/vue.ts";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  project: Pick<Project, "id">;
  language: Pick<Language, "id">;
}>();

const { t } = useI18n();

const translatableElementAmount = computedAsyncClient(async () => {
  return await trpc.project.countElement.query({
    projcetId: props.project.id,
  });
}, 0);

const translatedElementAmount = computedAsyncClient(async () => {
  return await trpc.project.countElement.query({
    projcetId: props.project.id,
    isTranslated: true,
    languageId: props.language.id,
  });
}, 0);

const approvedElementAmount = computedAsyncClient(async () => {
  return await trpc.project.countElement.query({
    projcetId: props.project.id,
    isTranslated: true,
    isApproved: true,
    languageId: props.language.id,
  });
}, 0);

const progressBarLines = computed<ProgressBarLine[]>(() => {
  return [
    {
      color: "#5B89C6",
      progress:
        translatedElementAmount.value / translatableElementAmount.value || 0,
    },
    {
      color: "#38C800",
      progress:
        approvedElementAmount.value / translatableElementAmount.value || 0,
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
