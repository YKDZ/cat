import type { TranslationSuggestion } from "@cat/shared";
import { defineStore, storeToRefs } from "pinia";
import { ref, shallowRef } from "vue";

import { orpc } from "#/rpc/orpc.ts";
import { useEditorContextStore } from "#/stores/editor/context.ts";
import { useEditorTableStore } from "#/stores/editor/table.ts";
import {
  createTrackedRequest,
  type TrackedRequest,
} from "#/utils/request-cancellation.ts";

export const useEditorSuggestionStore = defineStore("editorSuggestion", () => {
  const context = storeToRefs(useEditorContextStore());
  const table = storeToRefs(useEditorTableStore());
  const onNew = shallowRef<AsyncGenerator<TranslationSuggestion>>();
  let activeRequest: TrackedRequest | null = null;

  const suggestions = ref<TranslationSuggestion[]>([]);

  const subSuggestions = async () => {
    if (!table.elementId.value || !context.languageToId.value) return;

    activeRequest?.cancel();
    const request = createTrackedRequest();
    activeRequest = request;

    suggestions.value = [];

    try {
      onNew.value = await orpc.suggestion.onNew(
        {
          elementId: table.elementId.value,
          languageId: context.languageToId.value,
        },
        { signal: request.signal },
      );

      for await (const suggestion of onNew.value) {
        suggestions.value.push(suggestion);
      }
    } catch (error) {
      if (
        request.signal.aborted ||
        (error instanceof Error &&
          (error.message === "Stream was cancelled" ||
            error.name === "AbortError"))
      ) {
        return;
      }
      throw error;
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

  return { suggestions, subSuggestions, unsubscribe };
});
