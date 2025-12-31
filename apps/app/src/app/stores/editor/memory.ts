import { defineStore, storeToRefs } from "pinia";
import { ref } from "vue";
import type { MemorySuggestion } from "@cat/shared/schema/misc";
import { orpc } from "@/server/orpc";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useProfileStore } from "@/app/stores/profile.ts";

export const useEditorMemoryStore = defineStore("editorMemory", () => {
  const { elementId } = storeToRefs(useEditorTableStore());
  const { languageToId } = storeToRefs(useEditorContextStore());
  const { editorMemoryMinSimilarity } = storeToRefs(useProfileStore());

  const memories = ref<MemorySuggestion[]>([]);

  const subMemories = async () => {
    if (!elementId.value || !languageToId.value) return;

    memories.value = [];

    const onNew = await orpc.memory.onNew({
      elementId: elementId.value,
      translationLanguageId: languageToId.value,
      minMemorySimilarity: editorMemoryMinSimilarity.value[0],
    });

    for await (const memory of onNew) {
      memories.value.push(memory);
    }
  };

  return { memories, subMemories };
});
