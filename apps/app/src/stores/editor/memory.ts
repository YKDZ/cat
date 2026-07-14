import type { MemorySuggestion } from "@cat/shared";
import { defineStore, storeToRefs } from "pinia";
import { ref, shallowRef } from "vue";

import { orpc } from "#/rpc/orpc.ts";
import { useEditorContextStore } from "#/stores/editor/context.ts";
import { useEditorTableStore } from "#/stores/editor/table.ts";
import { useProfileStore } from "#/stores/profile.ts";
import {
  createTrackedRequest,
  type TrackedRequest,
} from "#/utils/request-cancellation.ts";

export const useEditorMemoryStore = defineStore("editorMemory", () => {
  const { elementId } = storeToRefs(useEditorTableStore());
  const { languageToId } = storeToRefs(useEditorContextStore());
  const { editorMemoryMinConfidence } = storeToRefs(useProfileStore());
  const onNew = shallowRef<AsyncGenerator<MemorySuggestion>>();
  let activeRequest: TrackedRequest | null = null;

  const memories = ref<MemorySuggestion[]>([]);
  const error = ref<string | null>(null);

  const subMemories = async () => {
    error.value = null;

    if (!elementId.value || !languageToId.value) return;

    activeRequest?.cancel();
    const request = createTrackedRequest();
    activeRequest = request;

    memories.value = [];

    try {
      onNew.value = await orpc.memory.onNew(
        {
          elementId: elementId.value,
          translationLanguageId: languageToId.value,
          minConfidence: editorMemoryMinConfidence.value[0],
        },
        { signal: request.signal },
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
    } catch (err) {
      if (
        request.signal.aborted ||
        (err instanceof Error &&
          (err.message === "Stream was cancelled" || err.name === "AbortError"))
      ) {
        return;
      }
      memories.value = [];
      error.value = err instanceof Error ? err.message : "unknown-error";
    } finally {
      if (activeRequest === request) activeRequest = null;
    }
  };

  const unsubscribe = async () => {
    activeRequest?.cancel();
    activeRequest = null;
    onNew.value = undefined;
  };

  if (!import.meta.env.SSR) {
    const dispose = (): void => {
      void unsubscribe();
    };
    window.addEventListener("beforeunload", dispose, { once: true });
  }

  return { memories, error, subMemories, unsubscribe };
});
