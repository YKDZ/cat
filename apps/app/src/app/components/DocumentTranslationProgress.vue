<script setup lang="ts">
import { computed } from "vue";
import { toShortFixed } from "@cat/shared/utils";
import { useI18n } from "vue-i18n";
import Dot from "./Dot.vue";
import ProgressBar from "./progress/bar/ProgressBar.vue";
import type { ProgressBarLine } from "@/app/components/progress/bar/index.ts";

const { t } = useI18n();

defineProps<{
  documentId: string;
  languageId: string;
}>();

const progressBarLines = computed<ProgressBarLine[]>(() => {
  const translationCount = 0;
  const translatableEleAmount = 1;

  if (!translationCount || !translatableEleAmount) return [];

  return [
    {
      color: "#5B89C6",
      progress: 0 / translatableEleAmount,
    },
    {
      color: "#38C800",
      progress: 0 / translatableEleAmount,
    },
  ];
});
</script>

<template>
  <div class="flex gap-2 items-center">
    <ProgressBar :lines="progressBarLines" />
    <div
      class="text-xs px-3 py-1 rounded-sm bg-highlight-darkest flex gap-0.5 w-36 items-center justify-center"
    >
      <span v-if="progressBarLines[0]"
        >{{ toShortFixed(progressBarLines[0].progress * 100) }}%</span
      >
      <span v-else>{{ t("0%") }}</span>
      <Dot class="color-highlight-content" />
      <span v-if="progressBarLines[1]"
        >{{ toShortFixed(progressBarLines[1].progress * 100) }}%</span
      >
      <span v-else>{{ t("0%") }}</span>
    </div>
  </div>
</template>
