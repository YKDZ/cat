import { defineStore, storeToRefs } from "pinia";
import { ref, shallowRef } from "vue";
import type { MemorySuggestion } from "@cat/shared/schema/misc";
import { trpc } from "@cat/app-api/trpc/client";
import type { Unsubscribable } from "@trpc/server/observable";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useProfileStore } from "@/app/stores/profile.ts";

export const useEditorMemoryStore = defineStore("editorMemory", () => {
  const sub = shallowRef<Unsubscribable>();
  const { elementId } = storeToRefs(useEditorTableStore());
  const { languageFromId, languageToId } = storeToRefs(useEditorContextStore());
  const { editorMemoryMinSimilarity } = storeToRefs(useProfileStore());

  const memories = ref<MemorySuggestion[]>([]);

  const subMemories = () => {
    if (!elementId.value || !languageFromId.value || !languageToId.value)
      return;

    if (sub.value) sub.value.unsubscribe();
    memories.value = [];

    sub.value = trpc.memory.onNew.subscribe(
      {
        elementId: elementId.value,
        sourceLanguageId: languageFromId.value,
        translationLanguageId: languageToId.value,
        minMemorySimilarity: editorMemoryMinSimilarity.value,
      },
      {
        onData: ({ data }) => {
          memories.value.push(data);
        },
      },
    );
  };

  return { memories, subMemories };
});
