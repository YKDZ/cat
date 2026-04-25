import type { MemorySuggestion } from "@cat/shared";

import { defineStore, storeToRefs } from "pinia";
import { ref, shallowRef } from "vue";

import { orpc } from "@/app/rpc/orpc";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useProfileStore } from "@/app/stores/profile.ts";

export const useEditorMemoryStore = defineStore("editorMemory", () => {
  const { elementId } = storeToRefs(useEditorTableStore());
  const { languageToId } = storeToRefs(useEditorContextStore());
  const { editorMemoryMinConfidence } = storeToRefs(useProfileStore());
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
          minConfidence: editorMemoryMinConfidence.value[0],
        },
        { signal: abortController.signal },
      );

      for await (const memory of onNew.value) {
        const existingIndex = memories.value.findIndex(
          (item) => item.id === memory.id,
        );
        if (existingIndex === -1) {
          memories.value.push(memory);
        } else {
          memories.value.splice(existingIndex, 1, memory);
        }
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
