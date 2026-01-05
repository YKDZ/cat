<script setup lang="ts">
import { useI18n } from "vue-i18n";
import ElementTranslationMeta from "./ElementTranslationMeta.vue";
import ElementTranslationVote from "./ElementTranslationVote.vue";
import TokenRenderer from "@/app/components/tokenizer/TokenRenderer.vue";
import UserAvatar from "@/app/components/UserAvatar.vue";
import ElementTranslationApprovalBtn from "./ElementTranslationApprovalBtn.vue";
import type { TranslationWithStatus } from "@/app/stores/editor/translation.ts";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/app/components/ui/collapsible";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";

const { t } = useI18n();

defineProps<{
  translation: TranslationWithStatus;
}>();
</script>

<template>
  <TextTooltip :tooltip="t('查看翻译元数据')" class="w-full" :align="'start'">
    <Collapsible>
      <CollapsibleTrigger class="w-full">
        <div
          class="px-3 py-2 bg-background flex w-full cursor-pointer items-center justify-between"
          :class="{
            'bg-destructive hover:bg-destructive-darker':
              translation.status === 'PROCESSING',
          }"
        >
          <div class="flex gap-2 items-center">
            <UserAvatar :user-id="translation.translatorId" :size="36" />
            <TokenRenderer :text="translation.text" />
          </div>
          <div class="flex gap-2 items-center">
            <ElementTranslationApprovalBtn :translation="translation" />
            <ElementTranslationVote class="ml-auto" :translation />
          </div></div
      ></CollapsibleTrigger>
      <CollapsibleContent class="CollapsibleContent">
        <ElementTranslationMeta :translation class="mt-1" />
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
