import { defineStore, storeToRefs } from "pinia";
import { ref, shallowRef } from "vue";
import type { TranslationSuggestion } from "@cat/shared/schema/misc";
import type { Unsubscribable } from "@trpc/server/observable";
import { trpc } from "@cat/app-api/trpc/client";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";

export const useEditorSuggestionStore = defineStore("editorSuggestion", () => {
  const sub = shallowRef<Unsubscribable>();
  const context = storeToRefs(useEditorContextStore());
  const table = storeToRefs(useEditorTableStore());

  const suggestions = ref<TranslationSuggestion[]>([]);

  const subSuggestions = () => {
    if (!table.elementId.value || !context.languageToId.value) return;

    if (sub.value) sub.value.unsubscribe();
    suggestions.value = [];

    sub.value = trpc.suggestion.onNew.subscribe(
      {
        elementId: table.elementId.value,
        languageId: context.languageToId.value,
      },
      {
        onData: ({ data }) => {
          suggestions.value.push(data);
        },
      },
    );
  };

  return { suggestions, subSuggestions };
});
