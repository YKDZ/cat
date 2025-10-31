import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { computedAsync } from "@vueuse/core";
import { trpc } from "@cat/app-api/trpc/client";

export const useEditorContextStore = defineStore("editorContext", () => {
  const documentId = ref<string | null>(null);
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

  const projectId = computed(() => {
    return document.value?.projectId ?? null;
  });

  const refresh = () => {
    currentPageIndex.value = -1;
  };

  return {
    documentId,
    languageToId,
    pageSize,
    currentPageIndex,
    document,
    projectId,
    refresh,
  };
});
