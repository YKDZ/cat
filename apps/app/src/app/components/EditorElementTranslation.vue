<script setup lang="ts">
import { computed } from "vue";
import { useDateFormat } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import EditorElementTranslationMeta from "./EditorElementTranslationMeta.vue";
import EditorElementTranslationVote from "./EditorElementTranslationVote.vue";
import TextTagger from "./tagger/TextTagger.vue";
import UserAvatar from "./UserAvatar.vue";
import EditorElementTranslationApprovementBtn from "./EditorElementTranslationApprovementBtn.vue";
import Icon from "./Icon.vue";
import type { TranslationWithStatus } from "@/app/stores/editor/translation.ts";
import type { TranslationApprovement } from "@cat/shared/schema/drizzle/translation";

const { t } = useI18n();

defineProps<{
  translation: TranslationWithStatus;
}>();

const approvement = computed<TranslationApprovement | null>(() => {
  return null;
});
</script>

<template>
  <div
    class="px-3 py-2 bg-highlight flex w-full cursor-pointer items-center justify-between relative hover:bg-highlight-darker"
    :class="{
      'bg-warning hover:bg-warning-darker': translation.status === 'PROCESSING',
    }"
  >
    <div class="flex gap-2 items-center">
      <UserAvatar :user-id="translation.translatorId" :size="36" />
      <div class="flex flex-col gap-1 max-w-full">
        <TextTagger :text="translation.value" />
        <EditorElementTranslationMeta :translation />
      </div>
    </div>
    <div class="flex gap-2 items-center">
      <EditorElementTranslationApprovementBtn
        class="ml-auto"
        :translation="translation"
      />
      <EditorElementTranslationVote class="ml-auto" :translation />
    </div>
  </div>
  <div v-if="approvement" class="text-sm flex gap-2 items-center">
    <div
      class="ml-5 border-b-2 border-l-2 border-highlight-darker rounded-bl-md h-5 w-5 -mt-3"
    />

    <div
      class="p-0.5 rounded-full bg-highlight-darkest inline-flex items-center justify-center"
    >
      <Icon icon="icon-[mdi--check]" small class="bg-success-darkest" />
    </div>
    <span class="text-success-darkest">{{ t("已批准") }}</span>
    <UserAvatar :user-id="approvement.creatorId" :size="36" />
    <span>{{
      useDateFormat(approvement.createdAt, "YYYY-MM-DD HH:mm:ss")
    }}</span>
  </div>
</template>
