<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import { onMounted, ref, watch } from "vue";
import EditorTaggedTranslation from "./EditorTaggedTranslation.vue";

const { translationValue, inputTextareaEl, originDivEl } =
  storeToRefs(useEditorStore());

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
});
</script>

<template>
  <div
    :style="{
      position: isSticky ? 'sticky' : 'static',
      top: topHeight + 'px',
    }"
    class="bg-highlight bg-op-50 flex h-fit max-w-full w-full backdrop-blur-sm"
  >
    <textarea
      ref="inputTextareaEl"
      v-model="translationValue"
      :placeholder="$t('在此输入译文')"
      class="px-5 pt-5 outline-0 max-w-1/2 min-h-32 min-w-1/2"
    />
    <div class="px-5 pt-5 flex flex-col gap-5 max-w-1/2 min-h-32 min-w-1/2">
      <EditorTaggedTranslation />
    </div>
  </div>
</template>
