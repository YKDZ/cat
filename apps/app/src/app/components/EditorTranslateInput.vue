<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import Render from "./formater/Render.vue";
import { onMounted, ref, watch } from "vue";

const { translationValue, document, inputTextareaEl, originDivEl } =
  storeToRefs(useEditorStore());

const { undo } = useEditorStore();

const isSticky = ref(false);

const topHeight = ref(originDivEl.value?.clientHeight);

watch(
  () => originDivEl.value?.clientHeight,
  (to) => (topHeight.value = to),
);

onMounted(() => {
  if (inputTextareaEl.value) {
    inputTextareaEl.value.focus();
  }
  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    }
  });
});
</script>

<template>
  <div
    :style="{
      position: isSticky ? 'sticky' : 'static',
      top: topHeight + 'px',
    }"
    class="bg-highlight bg-op-50 flex flex-col h-fit w-full backdrop-blur-sm"
  >
    <div class="px-5 py-3 border-b-1 w-full">
      <h3 class="text-sm font-bold mb-2">标记后的译文：</h3>
      <Render v-if="document" :type="document.Type" :text="translationValue" />
    </div>
    <textarea
      ref="inputTextareaEl"
      v-model="translationValue"
      placeholder="在此输入译文"
      class="px-5 pt-5 outline-0 h-auto min-h-32 w-full"
    />
  </div>
</template>
