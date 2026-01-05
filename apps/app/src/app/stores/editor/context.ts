import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { orpc } from "@/server/orpc";
import { useQuery } from "@pinia/colada";

export const useEditorContextStore = defineStore("editorContext", () => {
  const documentId = ref<string | null>(null);
  const languageToId = ref<string | null>(null);
  const pageSize = ref(16);
  // 从 1 开始
  const currentPage = ref(1);

  const { state: documentState } = useQuery({
    key: ["documents", documentId.value],
    query: async () =>
      orpc.document.get({
        documentId: documentId.value!,
      }),
    enabled: !import.meta.env.SSR,
  });

  const document = computed(() => {
    if (!documentId.value || !documentState.value || !documentState.value.data)
      return null;

    return documentState.value.data;
  });

  const projectId = computed(() => {
    return document.value?.projectId ?? null;
  });

  const refresh = () => {
    currentPage.value = 1;
  };

  return {
    documentId,
    languageToId,
    pageSize,
    currentPage,
    document,
    projectId,
    refresh,
  };
});
