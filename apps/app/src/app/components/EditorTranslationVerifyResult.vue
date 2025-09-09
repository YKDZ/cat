<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import { computed, ref, watch } from "vue";
import type { ClipperVerifyResult } from "./tagger";
import { clippers } from "./tagger";
import Collapse from "./Collapse.vue";
import Icon from "./Icon.vue";
import Modal from "./Modal.vue";
import HButton from "./headless/HButton.vue";

const { sourceParts, translationParts, translationValue } =
  storeToRefs(useEditorStore());

const clipperVerifyResults = ref<ClipperVerifyResult[]>([]);
const isProcessing = ref(false);
const isCollapseOpen = ref(false);
const isModalOpen = ref(false);

const isAllPass = computed(
  () => !clipperVerifyResults.value.find((result) => !result.isPass),
);

const verifyTranslation = async () => {
  isProcessing.value = false;

  clipperVerifyResults.value = [];
  for (const clipper of clippers.value) {
    if (clipper.verifyHandlers.length === 0) continue;
    await Promise.all(
      clipper.verifyHandlers.map(async ({ handler }) => {
        const result = await handler(
          clipper,
          sourceParts.value,
          translationParts.value,
        );
        clipperVerifyResults.value.push(result);
      }),
    );
  }
};

const failedResults = computed(() => {
  return clipperVerifyResults.value.filter((result) => !result.isPass);
});

watch([sourceParts, translationValue], async () => {
  isProcessing.value = true;
  await verifyTranslation();
  isProcessing.value = false;
});

watch(isAllPass, (to) => {
  isCollapseOpen.value = !to;
});
</script>

<template>
  <div class="flex gap-1 items-center">
    <HButton
      :classes="{
        base: 'btn btn-md btn-transparent btn-square',
      }"
      :icon="isAllPass ? 'i-mdi:check' : 'i-mdi:close'"
      :class="{
        'color-green': isAllPass,
        'color-red': !isAllPass,
      }"
    />
    <Collapse v-if="!isAllPass" v-model:is-open="isCollapseOpen">
      <ul>
        <li
          v-for="(result, index) in failedResults"
          :key="index"
          class="text-highlight-content font-normal flex gap-0.5 text-nowrap items-center"
        >
          <Icon small icon="i-mdi:close" class="color-red" />
          {{ result.error }}
        </li>
      </ul></Collapse
    >
  </div>
  <Modal v-model:is-open="isModalOpen"
    ><div class="px-10 py-6 rounded-sm bg-highlight"></div>
  </Modal>
</template>
