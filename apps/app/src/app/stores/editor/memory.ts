import type { MemorySuggestion } from "@cat/shared/schema/misc";

import { defineStore, storeToRefs } from "pinia";
import { ref, shallowRef } from "vue";

import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useProfileStore } from "@/app/stores/profile.ts";
import { orpc } from "@/server/orpc";

/**
 * Determine the best text for ghost text from a memory suggestion.
 * Returns the adapted translation if available, otherwise the raw translation
 * for exact/token-replaced results. Returns null for other types.
 */
const getGhostCandidate = (memory: MemorySuggestion): string | null => {
  if (
    memory.adaptationMethod === "exact" ||
    memory.adaptationMethod === "token-replaced"
  ) {
    return memory.adaptedTranslation ?? memory.translation;
  }
  return null;
};

export const useEditorMemoryStore = defineStore("editorMemory", () => {
  const tableStore = useEditorTableStore();
  const { elementId, translationValue } = storeToRefs(tableStore);
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

      let ghostTextSet = false;

      for await (const memory of onNew.value) {
        memories.value.push(memory);

        // Auto-trigger ghost text for the first exact/token-replaced result
        // when the translation input is still empty
        if (!ghostTextSet && translationValue.value === "") {
          const candidate = getGhostCandidate(memory);
          if (candidate) {
            tableStore.setGhostText(candidate);
            ghostTextSet = true;
          }
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
