<script setup lang="ts">
import type { Memory, MemorySuggestion } from "@cat/shared";
import { useEditorStore } from "../stores/editor";
import { useToastStore } from "../stores/toast";
import TextTagger from "./tagger/TextTagger.vue";
import { toShortFixed } from "../../../../../packages/shared/src/utils/string";
import UserAvatar from "./UserAvatar.vue";
import { onMounted, ref } from "vue";
import { trpc } from "@/server/trpc/client";

const { info } = useToastStore();
const { replace } = useEditorStore();

const props = defineProps<{
  memorySuggestion: MemorySuggestion;
}>();

const handleCopy = (suggestion: MemorySuggestion) => {
  replace(suggestion.translation);
  info(
    `成功复制来自记忆库 ${memory.value?.name ?? props.memorySuggestion.memoryId} 的记忆`,
  );
};

const memory = ref<Memory | null>(null);

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
    <button
      class="text-start cursor-pointer text-wrap"
      @click="handleCopy(memorySuggestion)"
    >
      <TextTagger :text="memorySuggestion.translation" />
    </button>
    <div class="text-sm text-highlight-content flex gap-2 items-center">
      <span>{{ toShortFixed(memorySuggestion.similarity * 100, 2) }}%</span>
      <UserAvatar
        :user-id="memorySuggestion.translatorId"
        with-name
        :size="16"
      />
      <span>{{ memory?.name ?? props.memorySuggestion.memoryId }}</span>
    </div>
  </div>
</template>
