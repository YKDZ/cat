<script setup lang="ts">
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cat/ui";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import type { TranslationWithStatus } from "@/stores/editor/translation.ts";

import TokenViewer from "@/components/editor/TokenViewer.vue";
import TextTooltip from "@/components/tooltip/TextTooltip.vue";
import UserAvatar from "@/components/UserAvatar.vue";
import { useEditorTableStore } from "@/stores/editor/table";

import TranslationQaResult from "./TranslationQaResult.vue";
import TranslationVote from "./TranslationVote.vue";

const { t } = useI18n();

/**
 * Props for the translation list item component.
 */
const props = defineProps<{
  /**
   * Translation entry to render.
   */
  translation: TranslationWithStatus;
}>();

const { element } = storeToRefs(useEditorTableStore());

const mainTranslation = computed(() =>
  props.translation.kind === "main" ? props.translation : null,
);

const isApproved = computed<boolean>(() => {
  return (
    props.translation.kind === "main" &&
    element.value?.approvedTranslationId === props.translation.id
  );
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
            <TranslationVote
              v-if="mainTranslation"
              class="ml-auto"
              :translation="mainTranslation"
            />
            <span v-else class="text-xs text-muted-foreground">
              {{ t("分支草稿翻译暂不支持投票") }}
            </span>
          </div>
        </div></CollapsibleTrigger
      >
      <CollapsibleContent class="CollapsibleContent">
        <TranslationQaResult
          v-if="mainTranslation"
          :translation-id="mainTranslation.id"
          class="border-t p-2"
        />
        <div v-else class="border-t p-2 text-xs text-muted-foreground">
          {{ t("分支草稿翻译暂不支持 QA 元数据") }}
        </div>
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
