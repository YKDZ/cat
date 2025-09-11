<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted } from "vue";
import { useDocumentStore } from "../stores/document";
import Dot from "./Dot.vue";
import type { ProgressBarLine } from "./progress/bar";
import ProgressBar from "./progress/bar/ProgressBar.vue";
import { toShortFixed } from "@cat/shared/utils";

const props = defineProps<{
  documentId: string;
  languageId: string;
}>();

const { updateTranslatableEleAmount, updateTranslationAmount } =
  useDocumentStore();

const { translatableEleAmounts, translationAmounts } =
  storeToRefs(useDocumentStore());

const progressBarLines = computed<ProgressBarLine[]>(() => {
  const translationCount = translationAmounts.value.get(props.documentId);
  const translatableEleAmount = translatableEleAmounts.value.get(
    props.documentId,
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
  await updateTranslatableEleAmount(props.documentId);
  await updateTranslationAmount(props.documentId, props.languageId);
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
