<script setup lang="ts">
import type { Unsubscribable } from "@trpc/server/observable";
import { storeToRefs } from "pinia";
import { watch } from "vue";
import { useI18n } from "vue-i18n";
import EditorMemoryListItem from "./EditorMemoryListItem.vue";
import { trpc } from "@/server/trpc/client.ts";
import { useEditorStore } from "@/app/stores/editor.ts";
import { useToastStore } from "@/app/stores/toast.ts";
import { useProfileStore } from "@/app/stores/profile.ts";

const { t } = useI18n();

const { trpcWarn } = useToastStore();
const { editorMemoryMinSimilarity } = storeToRefs(useProfileStore());
const { elementId, languageFromId, languageToId, memories } =
  storeToRefs(useEditorStore());

let memorySub: Unsubscribable;

const load = () => {
  if (!elementId.value || !languageFromId.value || !languageToId.value) return;
  if (memorySub) {
    memorySub.unsubscribe();
    memories.value = [];
  }

  memorySub = trpc.memory.onNew.subscribe(
    {
      elementId: elementId.value,
      sourceLanguageId: languageFromId.value,
      translationLanguageId: languageToId.value,
      minMemorySimilarity: editorMemoryMinSimilarity.value,
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
  <EditorMemoryListItem
    v-for="(memory, index) in memories"
    :key="memory.translation"
    :index
    :memory-suggestion="memory"
  />
  <div v-if="memories.length === 0" class="px-3 py-2 flex flex-col gap-1">
    {{ t("还没有可用的记忆") }}
  </div>
</template>
