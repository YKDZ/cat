<script setup lang="ts">
import Button from "./Button.vue";
import { useEditorStore } from "../stores/editor";
import { storeToRefs } from "pinia";

const { translate, jumpToNextUntranslated, copy, clear } = useEditorStore();

const { element } = storeToRefs(useEditorStore());

const handleTranslate = async (jumpToNext: boolean) => {
  await translate();
  if (jumpToNext) await jumpToNextUntranslated();
};
</script>

<template>
  <div class="px-2 pb-4 pt-1 flex w-full items-center justify-between">
    <div class="flex gap-2 items-center">
      <Button
        transparent
        no-text
        icon="i-mdi:content-copy"
        @click="copy(element?.value ?? ``)"
      />
      <Button
        transparent
        no-text
        icon="i-mdi:trash-can"
        class="text-red"
        @click="clear"
      />
    </div>
    <div class="flex gap-1 items-center">
      <Button transparent icon="i-mdi:check" @click="handleTranslate(false)"
        >提交</Button
      >
      <Button
        transparent
        icon="i-mdi:arrow-right"
        @click="handleTranslate(true)"
        >提交并继续</Button
      >
    </div>
  </div>
</template>
