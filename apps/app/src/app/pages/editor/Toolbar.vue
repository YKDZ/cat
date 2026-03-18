<script setup lang="ts">
import { Button } from "@cat/ui";
import { Check, Copy, MoveRight, Redo, Trash, Undo } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import { useEditorContextStore } from "@/app/stores/editor/context";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

import CurrentTranslationQaResult from "./CurrentTranslationQaResult.vue";

const { t } = useI18n();


const { translate, toNextUntranslated, replace, clear, undo, redo } =
  useEditorTableStore();
const { element, translationValue, sourceTokens, translationTokens } =
  storeToRefs(useEditorTableStore());
const { documentId } = storeToRefs(useEditorContextStore());


const handleTranslate = async (toNext: boolean) => {
  await translate();
  if (toNext) await toNextUntranslated();
};
</script>

<template>
  <div class="flex w-full items-center justify-between p-2">
    <div class="flex items-center gap-1">
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

      <CurrentTranslationQaResult
        v-if="element"
        :source="{
          tokens: sourceTokens,
          text: element.value,
          languageId: element.languageId,
        }"
        :translation="{
          tokens: translationTokens,
          text: translationValue,
          languageId: element?.languageId!,
        }"
        :documentId
      />
    </div>
    <div class="flex items-center gap-1">
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
