<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import EditorTranslationVerifyResult from "./EditorTranslationVerifyResult.vue";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { Button } from "@/app/components/ui/button";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import { Check, Copy, MoveRight, Redo, Trash, Undo } from "lucide-vue-next";

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
  <div class="p-2 flex w-full items-center justify-between">
    <div class="flex gap-1 items-center">
      <TextTooltip :tooltip="t('复制原文')">
        <Button
          size="icon"
          variant="ghost"
          @click="replace(element?.value ?? ``)"
          ><Copy
        /></Button>
      </TextTooltip>
      <TextTooltip :tooltip="t('清空译文')">
        <Button variant="ghost" size="icon" @click="clear">
          <Trash class="text-destructive" />
        </Button>
      </TextTooltip>
      <TextTooltip :tooltip="t('撤销')">
        <Button
          size="icon"
          variant="ghost"
          magic-key="Control+Z"
          @click="undo"
          @magic-click="undo"
        >
          <Undo />
        </Button>
      </TextTooltip>
      <TextTooltip :tooltip="t('重做')">
        <Button
          variant="ghost"
          size="icon"
          magic-key="Control+Shift+Z"
          @click="redo"
          @magic-click="redo"
        >
          <Redo />
        </Button>
      </TextTooltip>
      <TextTooltip :tooltip="t('切分器 QA')">
        <EditorTranslationVerifyResult />
      </TextTooltip>
    </div>
    <div class="flex gap-1 items-center">
      <Button
        variant="ghost"
        magic-key="Control+Shift+Enter"
        @click="handleTranslate(false)"
        @magic-click="handleTranslate(false)"
      >
        <Check />
        {{ t("提交") }}
      </Button>
      <Button
        variant="ghost"
        magic-key="Control+Enter"
        @click="handleTranslate(true)"
        @magic-click="handleTranslate(true)"
      >
        <MoveRight />
        {{ t("提交并继续") }}
      </Button>
    </div>
  </div>
</template>
