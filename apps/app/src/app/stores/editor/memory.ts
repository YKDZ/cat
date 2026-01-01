import { defineStore, storeToRefs } from "pinia";
import { ref, shallowRef } from "vue";
import type { MemorySuggestion } from "@cat/shared/schema/misc";
import { orpc } from "@/server/orpc";
import { useEditorTableStore } from "@/app/stores/editor/table.ts";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { useProfileStore } from "@/app/stores/profile.ts";
import { logger } from "@cat/shared/utils";

export const useEditorMemoryStore = defineStore("editorMemory", () => {
  const { elementId } = storeToRefs(useEditorTableStore());
  const { languageToId } = storeToRefs(useEditorContextStore());
  const { editorMemoryMinSimilarity } = storeToRefs(useProfileStore());
  const onNew = shallowRef<AsyncGenerator<MemorySuggestion>>();

  const memories = ref<MemorySuggestion[]>([]);

  const subMemories = async () => {
    if (onNew.value) {
      logger.warn("WEB", { msg: "Can not sub memories twice" });
      return;
    }
    if (!elementId.value || !languageToId.value) return;

    memories.value = [];

    onNew.value = await orpc.memory.onNew({
      elementId: elementId.value,
      translationLanguageId: languageToId.value,
      minMemorySimilarity: editorMemoryMinSimilarity.value[0],
    });

    try {
      for await (const memory of onNew.value) {
        memories.value.push(memory);
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

  return { memories, subMemories, unsubscribe };
});
