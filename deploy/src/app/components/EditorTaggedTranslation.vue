<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import Render from "./formater/Render.vue";
import { onMounted, ref, watch } from "vue";
import { PartData } from "./formater";

const {
  translationValue,
  document,
  inputTextareaEl,
  originDivEl,
  translationParts,
} = storeToRefs(useEditorStore());

const topHeight = ref(originDivEl.value?.clientHeight);

watch(
  () => originDivEl.value?.clientHeight,
  (to) => (topHeight.value = to),
);

onMounted(() => {
  if (inputTextareaEl.value) {
    inputTextareaEl.value.focus();
  }
});

const handleUpdate = (from: PartData[] | undefined, to: PartData[]) => {
  translationParts.value = to;
};
</script>

<template>
  <div class="px-5 pt-5 flex flex-col gap-5 w-full items-start">
    <Render
      v-if="document"
      :text="translationValue"
      interactable
      @update="handleUpdate"
    />
  </div>
</template>
