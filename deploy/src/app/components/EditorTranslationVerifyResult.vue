<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import { computed, ref, watch } from "vue";
import { clippers, ClipperVerifyResult } from "./formater";
import Button from "./Button.vue";
import Collapse from "./Collapse.vue";
import Icon from "./Icon.vue";

const { sourceParts, translationParts, translationValue } =
  storeToRefs(useEditorStore());

const clipperVerifyResults = ref<ClipperVerifyResult[]>([]);
const isProcessing = ref(false);
const isOpen = ref(false);

const isAllPass = computed(
  () => !clipperVerifyResults.value.find((result) => !result.isPass),
);

const verifyTranslation = async () => {
  isProcessing.value = false;

  clipperVerifyResults.value = [];
  for (const clipper of clippers.value) {
    if (!clipper.onVerify) continue;
    const result = await clipper.onVerify(
      sourceParts.value,
      translationParts.value,
    );
    clipperVerifyResults.value.push(result);
  }
};

const failedResults = computed(() => {
  return clipperVerifyResults.value.filter((result) => !result.isPass);
});

watch(
  translationValue,
  async () => {
    isProcessing.value = true;
    await verifyTranslation();
    isProcessing.value = false;
  },
  { immediate: true },
);

watch(isAllPass, (to) => {
  isOpen.value = !to;
});
</script>

<template>
  <div class="flex gap-1 items-center">
    <Button
      no-text
      transparent
      :icon="isAllPass ? 'i-mdi:check' : 'i-mdi:close'"
      :class="{
        'color-green': isAllPass,
        'color-red': !isAllPass,
      }"
    />
    <Collapse v-if="!isAllPass" v-model:is-open="isOpen">
      <ul>
        <li
          v-for="(result, index) in failedResults"
          :key="result.clipperId ?? index"
          class="text-highlight-content font-normal flex gap-0.5 text-nowrap items-center"
        >
          <Icon small icon="i-mdi:close" class="color-red" />
          {{ result.error }}
        </li>
      </ul></Collapse
    >
  </div>
</template>
