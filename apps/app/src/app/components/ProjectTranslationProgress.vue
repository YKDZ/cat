<script setup lang="ts">
import { computed } from "vue";
import { toShortFixed } from "@cat/shared/utils";
import type { ProgressBarLine } from "./progress/bar/index.ts";
import Dot from "./Dot.vue";
import ProgressBar from "@/app/components/progress/bar/ProgressBar.vue";

const props = defineProps<{
  projectId: string;
  languageId: string;
}>();

const progressBarLines = computed<ProgressBarLine[]>(() => {
  const translationCount = new Map().get(props.projectId);
  const translatableEleAmount = new Map().get(props.projectId);

  if (!translationCount || !translatableEleAmount) return [];

  return [
    {
      color: "#5B89C6",
      progress: translationCount.translatedEleAmount / translatableEleAmount,
    },
    {
      color: "#38C800",
      progress:
        translationCount.approvedTranslationAmount / translatableEleAmount,
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
      <span v-else>0%</span>
      <Dot class="color-highlight-content" />
      <span v-if="progressBarLines[1]"
        >{{ toShortFixed(progressBarLines[1].progress * 100) }}%</span
      >
      <span v-else>0%</span>
    </div>
  </div>
</template>
