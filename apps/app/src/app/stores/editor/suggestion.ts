import { defineStore, storeToRefs } from "pinia";
import { ref, shallowRef } from "vue";
import type { TranslationSuggestion } from "@cat/shared/schema/misc";
import { orpc } from "@/server/orpc";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

export const useEditorSuggestionStore = defineStore("editorSuggestion", () => {
  const context = storeToRefs(useEditorContextStore());
  const table = storeToRefs(useEditorTableStore());
  const onNew = shallowRef<AsyncGenerator<TranslationSuggestion>>();
  let abortController: AbortController | null = null;

  const suggestions = ref<TranslationSuggestion[]>([]);

  const subSuggestions = async () => {
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    if (!table.elementId.value || !context.languageToId.value) return;

    suggestions.value = [];

    try {
      onNew.value = await orpc.suggestion.onNew(
        {
          elementId: table.elementId.value,
          languageId: context.languageToId.value,
        },
        { signal: abortController.signal },
      );

      for await (const suggestion of onNew.value) {
        suggestions.value.push(suggestion);
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

  return { suggestions, subSuggestions, unsubscribe };
});
