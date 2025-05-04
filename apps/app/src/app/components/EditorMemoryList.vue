<script setup lang="ts">
import { Unsubscribable } from "@trpc/server/observable";
import { storeToRefs } from "pinia";
import { watch } from "vue";
import { useEditorStore } from "../stores/editor";
import { useToastStore } from "../stores/toast";
import { MemorySuggestion } from "@cat/shared";
import { trpc } from "@/server/trpc/client";
import Render from "./formater/Render.vue";

const { info, trpcWarn } = useToastStore();
const { copy } = useEditorStore();
const { elementId, languageFromId, memories, document } =
  storeToRefs(useEditorStore());

const handleCopy = (suggestion: MemorySuggestion) => {
  copy(suggestion.translation);
  info(`成功复制来自 ${suggestion.memoryId} 的记忆`);
};

let memorySub: Unsubscribable;

const load = () => {
  if (!elementId.value || !languageFromId.value) return;
  if (memorySub) {
    memorySub.unsubscribe();
    memories.value = [];
  }

  memorySub = trpc.memory.onNew.subscribe(
    {
      elementId: elementId.value,
      languageId: languageFromId.value,
    },
    {
      onData: ({ id, data }) => {
        memories.value.push(data);
      },
      onError: trpcWarn,
    },
  );
};

watch(elementId, load, { immediate: true });
</script>

<template>
  <div
    v-for="memory in memories"
    :key="memory.memoryId"
    class="px-3 py-2 flex flex-col gap-1 hover:bg-highlight-darker"
  >
    <button
      class="text-start cursor-pointer text-wrap"
      @click="handleCopy(memory)"
    >
      <Render
        v-if="document"
        :type="document.Type"
        :text="memory.translation"
      />
    </button>
    <div class="text-sm text-gray-600">{{ memory.translatorId }}</div>
    <div class="text-sm text-gray-600">
      {{ (memory.similarity * 100).toFixed(2) }}%
    </div>
  </div>
  <div v-if="memories.length === 0" class="px-3 py-2 flex flex-col gap-1">
    还没有可用的记忆
  </div>
</template>
