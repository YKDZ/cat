<script setup lang="ts">
import { computed, onMounted } from "vue";
import ProgressBar from "@/app/components/progress/bar/ProgressBar.vue";
import type { ProgressBarLine } from "./progress/bar";
import Dot from "./Dot.vue";
import { useProjectStore } from "../stores/project";
import { storeToRefs } from "pinia";
import { toShortFixed } from "@cat/shared";

const props = defineProps<{
  projectId: string;
  languageId: string;
}>();

const { updateTranslatableEleAmount, updateTranslationAmount } =
  useProjectStore();

const { translationAmounts, translatableEleAmounts } =
  storeToRefs(useProjectStore());

const progressBarLines = computed<ProgressBarLine[]>(() => {
  const translationCount = translationAmounts.value.get(props.projectId);
  const translatableEleAmount = translatableEleAmounts.value.get(
    props.projectId,
  );

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

onMounted(async () => {
  await updateTranslatableEleAmount(props.projectId);
  await updateTranslationAmount(props.projectId, props.languageId);
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
