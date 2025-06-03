<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import Button from "./Button.vue";
import EditorTranslationVerifyResult from "./EditorTranslationVerifyResult.vue";

const { translate, jumpToNextUntranslated, replace, clear } = useEditorStore();
const { undo } = useEditorStore();

const { element } = storeToRefs(useEditorStore());

const handleTranslate = async (jumpToNext: boolean) => {
  await translate();
  if (jumpToNext) await jumpToNextUntranslated();
};
</script>

<template>
  <div class="px-2 pb-4 pt-1 flex w-full items-center justify-between">
    <div class="flex gap-1 items-center">
      <Button
        transparent
        no-text
        icon="i-mdi:content-copy"
        @click="replace(element?.value ?? ``)"
      />
      <Button
        transparent
        no-text
        icon="i-mdi:trash-can"
        class="text-red"
        @click="clear"
      />
      <Button transparent icon="i-mdi:undo" magic-key="Control+Z" @click="undo" />
      <EditorTranslationVerifyResult />
    </div>
    <div class="flex gap-1 items-center">
      <Button
        transparent
        icon="i-mdi:check"
        magic-key="Control+Shift+Enter"
        @click="handleTranslate(false)"
        @magic-click="handleTranslate(false)"
      >
        提交
      </Button>
      <Button
        transparent
        icon="i-mdi:arrow-right"
        magic-key="Control+Enter"
        @click="handleTranslate(true)"
        @magic-click="handleTranslate(true)"
      >
        提交并继续
      </Button>
    </div>
  </div>
</template>
