<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import EditorTranslationVerifyResult from "./EditorTranslationVerifyResult.vue";
import HButton from "./headless/HButton.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

const { t } = useI18n();

const { translate, toNextUntranslated, replace, clear, undo, redo } =
  useEditorTableStore();
const { element, selectedTranslationId } = storeToRefs(useEditorTableStore());

const handleTranslate = async (toNext: boolean) => {
  await translate();
  if (toNext) await toNextUntranslated();
};
</script>

<template>
  <div class="px-2 pb-4 pt-1 flex w-full items-center justify-between">
    <div class="flex gap-1 items-center">
      <HButton
        :classes="{
          base: 'btn btn-md btn-transparent btn-square',
          icon: 'btn-icon btn-icon-sm',
        }"
        icon="i-mdi:content-copy"
        @click="replace(element?.value ?? ``)"
      />
      <HButton
        :classes="{
          base: 'btn btn-md btn-transparent btn-square',
          icon: 'btn-icon btn-icon-red btn-icon-sm',
        }"
        icon="i-mdi:trash-can"
        @click="clear"
      />
      <HButton
        :classes="{
          base: 'btn btn-md btn-transparent btn-square',
          icon: 'btn-icon btn-icon-sm',
        }"
        icon="i-mdi:undo"
        magic-key="Control+Z"
        @click="undo"
        @magic-click="undo"
      />
      <HButton
        :classes="{
          base: 'btn btn-md btn-transparent btn-square',
          icon: 'btn-icon btn-icon-sm',
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
          icon: 'btn-icon btn-icon-sm',
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
          icon: 'btn-icon btn-icon-sm',
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
