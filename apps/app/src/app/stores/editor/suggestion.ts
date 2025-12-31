import { defineStore, storeToRefs } from "pinia";
import { ref } from "vue";
import type { TranslationSuggestion } from "@cat/shared/schema/misc";
import { orpc } from "@/server/orpc";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

export const useEditorSuggestionStore = defineStore("editorSuggestion", () => {
  const context = storeToRefs(useEditorContextStore());
  const table = storeToRefs(useEditorTableStore());

  const suggestions = ref<TranslationSuggestion[]>([]);

  const subSuggestions = async () => {
    if (!table.elementId.value || !context.languageToId.value) return;

    suggestions.value = [];

    const onNew = await orpc.suggestion.onNew({
      elementId: table.elementId.value,
      languageId: context.languageToId.value,
    });

    for await (const suggestion of onNew) {
      suggestions.value.push(suggestion);
    }
  };

  return { suggestions, subSuggestions };
});
