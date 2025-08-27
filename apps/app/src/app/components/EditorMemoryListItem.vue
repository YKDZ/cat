<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { toShortFixed, type Memory, type MemorySuggestion } from "@cat/shared";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useEditorStore } from "../stores/editor";
import { useToastStore } from "../stores/toast";
import TextTagger from "./tagger/TextTagger.vue";
import UserAvatar from "./UserAvatar.vue";
import { useHotKeys } from "../utils/magic-keys";

const { info } = useToastStore();
const { replace } = useEditorStore();
const { t } = useI18n();

const props = defineProps<{
  memorySuggestion: MemorySuggestion;
  index: number;
}>();

const handleCopy = () => {
  replace(props.memorySuggestion.translation);
  info(
    t("成功复制来自记忆库 {name} 的记忆", {
      name: memory.value?.name ?? props.memorySuggestion.memoryId,
    }),
  );
};

const memory = ref<Memory | null>(null);

useHotKeys(`M+${props.index + 1}`, handleCopy);

onMounted(() => {
  trpc.memory.query
    .query({ id: props.memorySuggestion.memoryId })
    .then((mem) => {
      if (!mem) return;
      memory.value = mem;
    });
});
</script>

<template>
  <div class="px-3 py-2 flex flex-col gap-1 hover:bg-highlight-darker">
    <button class="text-start cursor-pointer text-wrap" @click="handleCopy">
      <TextTagger :text="memorySuggestion.translation" />
    </button>
    <div class="text-sm text-highlight-content flex gap-2 items-center">
      <span>{{
        t("{similarity}%", {
          similarity: toShortFixed(memorySuggestion.similarity * 100, 2),
        })
      }}</span>
      <UserAvatar
        :user-id="memorySuggestion.translatorId"
        with-name
        :size="16"
      />
      <span>{{ memory?.name ?? props.memorySuggestion.memoryId }}</span>
    </div>
  </div>
</template>
