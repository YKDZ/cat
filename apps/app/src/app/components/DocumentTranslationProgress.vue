<script setup lang="ts">
import { computed } from "vue";
import { toShortFixed } from "@cat/shared/utils";
import { useI18n } from "vue-i18n";
import Dot from "./Dot.vue";
import ProgressBar from "./progress/bar/ProgressBar.vue";
import type { ProgressBarLine } from "@/app/components/progress/bar/index.ts";
import { computedAsyncClient } from "@/app/utils/vue";
import { trpc } from "@cat/app-api/trpc/client";
import type { Document } from "@cat/shared/schema/drizzle/document";
import type { Language } from "@cat/shared/schema/drizzle/misc";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";

const { t } = useI18n();

const props = defineProps<{
  document: Pick<Document, "id">;
  language: Pick<Language, "id">;
}>();

const translatableElementAmount = computedAsyncClient(async () => {
  return await trpc.document.countElement.query({
    documentId: props.document.id,
  });
}, 0);

const translatedElementAmount = computedAsyncClient(async () => {
  return await trpc.document.countElement.query({
    documentId: props.document.id,
    isTranslated: true,
    languageId: props.language.id,
  });
}, 0);

const approvedElementAmount = computedAsyncClient(async () => {
  return await trpc.document.countElement.query({
    documentId: props.document.id,
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
