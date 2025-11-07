<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import EditorTranslationVerifyResult from "./EditorTranslationVerifyResult.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { Button } from "@/app/components/ui/button";

const { t } = useI18n();

const { translate, toNextUntranslated, replace, clear, undo, redo } =
  useEditorTableStore();
const { element } = storeToRefs(useEditorTableStore());

const handleTranslate = async (toNext: boolean) => {
  await translate();
  if (toNext) await toNextUntranslated();
};
</script>

<template>
  <div class="px-2 pb-4 pt-1 flex w-full items-center justify-between">
    <div class="flex gap-1 items-center">
      <Button size="icon" variant="ghost" @click="replace(element?.value ?? ``)"
        ><div class="icon-[mdi--content-copy] size-4"
      /></Button>
      <Button variant="ghost" size="icon" @click="clear">
        <div class="icon-[mdi--trash-can] size-4 text-error" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        magic-key="Control+Z"
        @click="undo"
        @magic-click="undo"
      >
        <div class="icon-[mdi--undo] size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        magic-key="Control+Shift+Z"
        @click="redo"
        @magic-click="redo"
      >
        <div class="icon-[mdi--redo] size-4" />
      </Button>
      <EditorTranslationVerifyResult />
    </div>
    <div class="flex gap-1 items-center">
      <Button
        variant="ghost"
        magic-key="Control+Shift+Enter"
        @click="handleTranslate(false)"
        @magic-click="handleTranslate(false)"
      >
        <div class="icon-[mdi--check] size-4" />
        {{ t("提交") }}
      </Button>
      <Button
        variant="ghost"
        magic-key="Control+Enter"
        @click="handleTranslate(true)"
        @magic-click="handleTranslate(true)"
      >
        <div class="icon-[mdi--arrow-right] size-4" />
        {{ t("提交并继续") }}
      </Button>
    </div>
  </div>
</template>
