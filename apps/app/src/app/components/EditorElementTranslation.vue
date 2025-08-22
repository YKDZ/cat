<script setup lang="ts">
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import type { TranslationWithStatus } from "../stores/editor";
import { useEditorStore } from "../stores/editor";
import EditorElementTranslationMeta from "./EditorElementTranslationMeta.vue";
import EditorElementTranslationVote from "./EditorElementTranslationVote.vue";
import TextTagger from "./tagger/TextTagger.vue";
import UserAvatar from "./UserAvatar.vue";
import { computed } from "vue";
import EditorElementTranslationApprovementBtn from "./EditorElementTranslationApprovementBtn.vue";
import { useDateFormat } from "@vueuse/core";
import Icon from "./Icon.vue";

const { translationValue, selectedTranslationId, isProofreading } =
  storeToRefs(useEditorStore());
const { user } = usePageContext();

const props = defineProps<{
  translation: TranslationWithStatus;
}>();

const handleSelect = () => {
  // TODO 目前只能修改自己的翻译
  if (
    selectedTranslationId.value !== props.translation.id &&
    props.translation.translatorId === user?.id
  ) {
    selectedTranslationId.value = props.translation.id;
    translationValue.value = props.translation.value;
    return;
  } else selectedTranslationId.value = null;
};

const isApproved = computed(() => {
  if (!props.translation.Approvements) return false;
  return (
    props.translation.Approvements.findIndex(
      (approvment) => approvment.isActive,
    ) !== -1
  );
});

const approvement = computed(() => {
  if (!props.translation.Approvements) return null;
  return props.translation.Approvements.find((a) => a.isActive);
});
</script>

<template>
  <div
    class="px-3 py-2 bg-highlight flex w-full cursor-pointer items-center justify-between relative hover:bg-highlight-darker"
    :class="{
      'bg-warning hover:bg-warning-darker': translation.status === 'PROCESSING',
      'border-l-2 border-base': selectedTranslationId === translation.id,
    }"
    @click="handleSelect"
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
      <Icon icon="i-mdi:check" small class="bg-success-darkest" />
    </div>
    <span class="text-success-darkest">{{ $t("已批准") }}</span>
    <UserAvatar :user-id="approvement.creatorId" :size="36" />
    <span>{{
      useDateFormat(approvement.createdAt, "YYYY-MM-DD HH:mm:ss")
    }}</span>
  </div>
</template>
