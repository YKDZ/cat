<script setup lang="ts">
import { Button } from "@cat/ui";
import { Check, Copy, MoveRight, Redo, Trash, Undo } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import TextTooltip from "@/components/tooltip/TextTooltip.vue";
import { useEditorContextStore } from "@/stores/editor/context";
import { useEditorTableStore } from "@/stores/editor/table.ts";
import { useProjectWriteCapabilityStore } from "@/stores/write-capability";

import CurrentTranslationQaResult from "./CurrentTranslationQaResult.vue";

const { t } = useI18n();

const { translate, toNextUntranslated, replace, clear, undo, redo } =
  useEditorTableStore();
const { element, translationValue, sourceTokens, translationTokens } =
  storeToRefs(useEditorTableStore());
const context = useEditorContextStore();
const { activeContentNodeId, currentElementContentNodeId } =
  storeToRefs(context);
const writeCapability = useProjectWriteCapabilityStore();
const { canWrite, disabledReason } = storeToRefs(writeCapability);

const qaContentNodeId = computed(
  () => currentElementContentNodeId.value ?? activeContentNodeId.value,
);

const disabledTooltip = computed(() =>
  disabledReason.value ? t(disabledReason.value) : null,
);

const handleReplaceSource = () => {
  if (!canWrite.value) return;
  replace(element.value?.value ?? "");
};

const handleClear = () => {
  if (!canWrite.value) return;
  clear();
};

const handleUndo = () => {
  if (!canWrite.value) return;
  undo();
};

const handleRedo = () => {
  if (!canWrite.value) return;
  redo();
};

const handleTranslate = async (toNext: boolean) => {
  if (!canWrite.value) return;
  await translate();
  if (toNext) await toNextUntranslated();
};
</script>

<template>
  <div class="flex w-full items-center justify-between p-2">
    <div class="flex items-center gap-1">
      <TextTooltip :tooltip="disabledTooltip ?? t('复制原文')">
        <Button
          size="icon"
          variant="ghost"
          :disabled="!canWrite"
          :title="disabledTooltip ?? t('复制原文')"
          @click="handleReplaceSource"
          ><Copy
        /></Button>
      </TextTooltip>
      <TextTooltip :tooltip="disabledTooltip ?? t('清空译文')">
        <Button
          variant="ghost"
          size="icon"
          :disabled="!canWrite"
          :title="disabledTooltip ?? t('清空译文')"
          @click="handleClear"
        >
          <Trash class="text-destructive" />
        </Button>
      </TextTooltip>
      <TextTooltip :tooltip="disabledTooltip ?? t('撤销')">
        <Button
          size="icon"
          variant="ghost"
          magic-key="Control+Z"
          :disabled="!canWrite"
          :title="disabledTooltip ?? t('撤销')"
          @click="handleUndo"
          @magic-click="handleUndo"
        >
          <Undo />
        </Button>
      </TextTooltip>
      <TextTooltip :tooltip="disabledTooltip ?? t('重做')">
        <Button
          variant="ghost"
          size="icon"
          magic-key="Control+Shift+Z"
          :disabled="!canWrite"
          :title="disabledTooltip ?? t('重做')"
          @click="handleRedo"
          @magic-click="handleRedo"
        >
          <Redo />
        </Button>
      </TextTooltip>

      <!-- 当前值是当前元素的主内容节点 ID，用于 QA 检查范围。 -->
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
          languageId: element.languageId,
        }"
        :content-node-id="qaContentNodeId"
      />
    </div>
    <div class="flex items-center gap-1">
      <Button
        variant="ghost"
        magic-key="Control+Shift+Enter"
        :disabled="!canWrite"
        :title="disabledTooltip ?? t('提交')"
        @click="handleTranslate(false)"
        @magic-click="handleTranslate(false)"
      >
        <Check />
        {{ t("提交") }}
      </Button>
      <Button
        variant="ghost"
        magic-key="Control+Enter"
        :disabled="!canWrite"
        :title="disabledTooltip ?? t('提交并继续')"
        @click="handleTranslate(true)"
        @magic-click="handleTranslate(true)"
      >
        <MoveRight />
        {{ t("提交并继续") }}
      </Button>
    </div>
  </div>
</template>
