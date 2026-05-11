import { useQuery } from "@pinia/colada";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { orpc } from "@/rpc/orpc";

export const useEditorContextStore = defineStore("editorContext", () => {
  const contentNodeId = ref<string | undefined>();
  const languageToId = ref<string | undefined>();
  const pageSize = ref(16);
  // 从 1 开始
  const currentPage = ref(1);

  const { state: contentNodeState } = useQuery({
    key: () => ["content-node", contentNodeId.value!],
    query: async () =>
      orpc.document.get({
        documentId: contentNodeId.value!,
      }),
    enabled: () => !import.meta.env.SSR && !!contentNodeId.value,
  });

  const document = computed(() => {
    if (
      !contentNodeId.value ||
      !contentNodeState.value ||
      !contentNodeState.value.data
    )
      return null;

    return contentNodeState.value.data;
  });

  const projectId = computed(() => {
    return document.value?.projectId ?? null;
  });

  const refresh = () => {
    currentPage.value = 1;
  };

  return {
    contentNodeId,
    // Keep documentId as an alias for URL/backward-compat during transition
    documentId: contentNodeId,
    languageToId,
    pageSize,
    currentPage,
    document,
    projectId,
    refresh,
  };
});
