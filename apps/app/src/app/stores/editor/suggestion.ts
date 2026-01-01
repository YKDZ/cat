import { defineStore, storeToRefs } from "pinia";
import { ref, shallowRef } from "vue";
import type { TranslationSuggestion } from "@cat/shared/schema/misc";
import { orpc } from "@/server/orpc";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { logger } from "@cat/shared/utils";

export const useEditorSuggestionStore = defineStore("editorSuggestion", () => {
  const context = storeToRefs(useEditorContextStore());
  const table = storeToRefs(useEditorTableStore());
  const onNew = shallowRef<AsyncGenerator<TranslationSuggestion>>();

  const suggestions = ref<TranslationSuggestion[]>([]);

  const subSuggestions = async () => {
    if (onNew.value) {
      logger.warn("WEB", { msg: "Can not sub suggestions twice" });
      return;
    }
    if (!table.elementId.value || !context.languageToId.value) return;

    suggestions.value = [];

    onNew.value = await orpc.suggestion.onNew({
      elementId: table.elementId.value,
      languageId: context.languageToId.value,
    });

    try {
      for await (const suggestion of onNew.value) {
        suggestions.value.push(suggestion);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Stream was cancelled") {
        return;
      }
      throw error;
    }
  };

  const unsubscribe = async () => {
    if (!onNew.value) return;

    await onNew.value.return({});
    onNew.value = undefined;
    return;
  };

  return { suggestions, subSuggestions, unsubscribe };
});
