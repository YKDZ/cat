import { defineStore, storeToRefs } from "pinia";
import { ref, shallowRef } from "vue";
import type { MemorySuggestion } from "@cat/shared/schema/misc";
import { orpc } from "@/server/orpc";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useProfileStore } from "@/app/stores/profile.ts";

export const useEditorMemoryStore = defineStore("editorMemory", () => {
  const { elementId } = storeToRefs(useEditorTableStore());
  const { languageToId } = storeToRefs(useEditorContextStore());
  const { editorMemoryMinSimilarity } = storeToRefs(useProfileStore());
  const onNew = shallowRef<AsyncGenerator<MemorySuggestion>>();
  let abortController: AbortController | null = null;

  const memories = ref<MemorySuggestion[]>([]);

  const subMemories = async () => {
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    if (!elementId.value || !languageToId.value) return;

    memories.value = [];

    try {
      onNew.value = await orpc.memory.onNew(
        {
          elementId: elementId.value,
          translationLanguageId: languageToId.value,
          minMemorySimilarity: editorMemoryMinSimilarity.value[0],
        },
        { signal: abortController.signal },
      );

      for await (const memory of onNew.value) {
        memories.value.push(memory);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "Stream was cancelled" ||
          error.name === "AbortError")
      ) {
        return;
      }
      throw error;
    }
  };

  const unsubscribe = async () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    onNew.value = undefined;
  };

  return { memories, subMemories, unsubscribe };
});
