<script setup lang="ts">
import type { Translation, TranslationApprovment } from "@cat/shared";
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { computed } from "vue";
import type { TranslationWithStatus } from "../stores/editor";
import { useEditorStore } from "../stores/editor";
import EditorElementTranslationMeta from "./EditorElementTranslationMeta.vue";
import EditorElementTranslationVote from "./EditorElementTranslationVote.vue";
import TextTagger from "./tagger/TextTagger.vue";
import UserAvatar from "./UserAvatar.vue";
import { trpc } from "@/server/trpc/client";
import { useToastStore } from "../stores/toast";
import Button from "./Button.vue";

const emits = defineEmits<{
  (e: "approve", approvments: TranslationApprovment[]): void;
  (e: "unapprove", approvments: TranslationApprovment[]): void;
}>();

const { info, trpcWarn } = useToastStore();

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
  if (!props.translation.Approvments) return false;
  return (
    props.translation.Approvments.findIndex(
      (approvment) => approvment.isActive,
    ) !== -1
  );
});

const handleApprove = async () => {
  if (isApproved.value) return;

  await trpc.translation.approve
    .mutate({
      ids: [props.translation.id],
    })
    .then((approvement) => {
      emits("approve", approvement);
      info("成功批准");
    })
    .catch(trpcWarn);
};

const handleUnapprove = async () => {
  if (!isApproved.value) return;

  await trpc.translation.unapprove
    .mutate({
      ids: [props.translation.id],
    })
    .then((approvement) => {
      emits("unapprove", approvement);
      info("成功取消批准");
    })
    .catch(trpcWarn);
};
</script>

<template>
  <div
    class="px-3 py-2 flex gap-2 w-full cursor-pointer items-center relative"
    :class="{
      'bg-warning hover:bg-warning-darker': translation.status === 'PROCESSING',
      'bg-success hover:bg-success-darker': isApproved,
      ' bg-highlight hover:bg-highlight-darker': !isApproved,
      'border-l-2 border-base': selectedTranslationId === translation.id,
    }"
    @click="handleSelect"
  >
    <UserAvatar :user-id="translation.translatorId" :size="36" />
    <div class="flex flex-col gap-1 max-w-full">
      <TextTagger :text="translation.value" />
      <EditorElementTranslationMeta :meta="translation.meta" />
    </div>
    <EditorElementTranslationVote v-if="!isProofreading" :translation />
    <div v-if="isProofreading" class="flex gap-1 items-center">
      <Button
        v-if="!isApproved"
        no-text
        transparent
        icon="i-mdi:check"
        @click.stop="handleApprove"
      />
      <Button
        v-if="isApproved"
        no-text
        transparent
        icon="i-mdi:close"
        @click.stop="handleUnapprove"
      />
    </div>
  </div>
</template>
