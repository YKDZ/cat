<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import type { Translation, TranslationVote } from "@cat/shared";
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, onMounted, ref, watch } from "vue";
import { useEditorStore } from "../stores/editor";
import { useToastStore } from "../stores/toast";
import EditorElementTranslationMeta from "./EditorElementTranslationMeta.vue";
import EditorElementTranslationVote from "./EditorElementTranslationVote.vue";
import TextTagger from "./tagger/TextTagger.vue";
import UserAvatar from "./UserAvatar.vue";

const { translationValue, selectedTranslationId } =
  storeToRefs(useEditorStore());
const { user } = usePageContext();

const selfVote = ref<TranslationVote | null>(null);
const vote = ref<number | null>(null);

const props = defineProps<{
  translation: Translation;
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
</script>

<template>
  <div
    class="px-3 py-2 flex gap-2 w-full cursor-pointer items-center relative"
    :class="{
      'bg-success hover:bg-success-darker': isApproved,
      ' bg-highlight hover:bg-highlight-darker': !isApproved,
      'border-l-2 border-base': selectedTranslationId === translation.id,
    }"
    @click="handleSelect"
  >
    <UserAvatar
      v-if="translation.Translator"
      :user="translation.Translator"
      :size="36"
    />
    <div class="flex flex-col gap-1 w-full">
      <TextTagger :text="translation.value" />
      <EditorElementTranslationMeta :meta="translation.meta" />
    </div>
    <EditorElementTranslationVote :translation />
  </div>
</template>
