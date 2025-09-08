<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import EditorTranslationVerifyResult from "./EditorTranslationVerifyResult.vue";
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";

const { t } = useI18n();

const { translate, jumpToNextUntranslated, replace, clear } = useEditorStore();
const { undo, redo } = useEditorStore();

const { element, selectedTranslationId } = storeToRefs(useEditorStore());

const handleTranslate = async (jumpToNext: boolean) => {
  await translate(!jumpToNext);
  if (jumpToNext) await jumpToNextUntranslated();
};
</script>

<template>
  <div class="px-2 pb-4 pt-1 flex w-full items-center justify-between">
    <div class="flex gap-1 items-center">
      <HButton
        :classes="{
          base: 'btn btn-md btn-transparent btn-square',
        }"
        icon="i-mdi:content-copy"
        @click="replace(element?.value ?? ``)"
      />
      <HButton
        :classes="{
          base: 'btn btn-md btn-transparent btn-square',
        }"
        icon="i-mdi:trash-can"
        @click="clear"
      />
      <HButton
        :classes="{
          base: 'btn btn-md btn-transparent btn-square',
        }"
        icon="i-mdi:undo"
        magic-key="Control+Z"
        @click="undo"
        @magic-click="undo"
      />
      <HButton
        :classes="{
          base: 'btn btn-md btn-transparent btn-square',
        }"
        icon="i-mdi:redo"
        magic-key="Control+Shift+Z"
        @click="redo"
        @magic-click="redo"
      />
      <EditorTranslationVerifyResult />
    </div>
    <div class="flex gap-1 items-center">
      <HButton
        :classes="{
          base: 'btn btn-md btn-transparent',
        }"
        icon="i-mdi:check"
        magic-key="Control+Shift+Enter"
        @click="handleTranslate(false)"
        @magic-click="handleTranslate(false)"
      >
        {{ selectedTranslationId ? t("更新") : t("提交") }}
      </HButton>
      <HButton
        :classes="{
          base: 'btn btn-md btn-transparent',
        }"
        icon="i-mdi:arrow-right"
        magic-key="Control+Enter"
        @click="handleTranslate(true)"
        @magic-click="handleTranslate(true)"
      >
        {{ selectedTranslationId ? t("更新并继续") : t("提交并继续") }}
      </HButton>
    </div>
  </div>
</template>
