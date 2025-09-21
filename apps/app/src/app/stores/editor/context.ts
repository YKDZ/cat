import { defineStore } from "pinia";
import { ref } from "vue";
import { computedAsync } from "@vueuse/core";
import { trpc } from "@cat/app-api/trpc/client";

export const useEditorContextStore = defineStore("editorContext", () => {
  const documentId = ref<string | null>(null);
  const languageFromId = ref<string | null>(null);
  const languageToId = ref<string | null>(null);
  const pageSize = ref(16);
  const currentPageIndex = ref(-1);

  const document = computedAsync(async () => {
    if (import.meta.env.SSR) return null;
    if (!documentId.value) return null;

    return await trpc.document.get.query({
      id: documentId.value,
    });
  });

  return {
    documentId,
    languageFromId,
    languageToId,
    pageSize,
    currentPageIndex,
    document,
  };
});
