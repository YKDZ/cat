<script setup lang="ts">
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cat/ui";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import type { TranslationWithStatus } from "@/app/stores/editor/translation.ts";

import TokenViewer from "@/app/components/editor/TokenViewer.vue";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import UserAvatar from "@/app/components/UserAvatar.vue";
import { useEditorTableStore } from "@/app/stores/editor/table";

import TranslationApprovalBtn from "./TranslationApprovalBtn.vue";
import TranslationQaResult from "./TranslationQaResult.vue";
import TranslationVote from "./TranslationVote.vue";

const { t } = useI18n();

const props = defineProps<{
  translation: TranslationWithStatus;
}>();

const { element } = storeToRefs(useEditorTableStore());

const isApproved = computed<boolean>(() => {
  return element.value?.approvedTranslationId === props.translation.id;
});
</script>

<template>
  <TextTooltip :tooltip="t('查看翻译元数据')" class="w-full" :align="'start'">
    <Collapsible>
      <CollapsibleTrigger class="w-full">
        <div
          class="flex w-full cursor-pointer items-center justify-between bg-background px-3 py-2"
          :class="{
            'bg-green-100 hover:bg-green-200': isApproved,
          }"
        >
          <div class="flex items-center gap-2">
            <UserAvatar :user-id="translation.translatorId" :size="36" />
            <TokenViewer :text="translation.text" />
          </div>
          <div class="flex items-center gap-2">
            <TranslationApprovalBtn :translation="translation" />
            <TranslationVote class="ml-auto" :translation />
          </div></div
      ></CollapsibleTrigger>
      <CollapsibleContent class="CollapsibleContent">
        <TranslationQaResult
          :translation-id="translation.id"
          class="border-t p-2"
        />
      </CollapsibleContent>
    </Collapsible>
  </TextTooltip>
</template>

<style scoped>
.CollapsibleContent {
  overflow: hidden;
}
.CollapsibleContent[data-state="open"] {
  animation: slideDown 150ms ease-out;
}
.CollapsibleContent[data-state="closed"] {
  animation: slideUp 150ms ease-out;
}

@keyframes slideDown {
  from {
    height: 0;
  }
  to {
    height: var(--reka-collapsible-content-height);
  }
}

@keyframes slideUp {
  from {
    height: var(--reka-collapsible-content-height);
  }
  to {
    height: 0;
  }
}
</style>
