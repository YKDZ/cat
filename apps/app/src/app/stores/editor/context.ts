import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { computedAsyncClient } from "@/app/utils/vue";
import { orpc } from "@/server/orpc";

export const useEditorContextStore = defineStore("editorContext", () => {
  const documentId = ref<string | null>(null);
  const languageToId = ref<string | null>(null);
  const pageSize = ref(16);
  // 从 1 开始
  const currentPage = ref(1);

  const document = computedAsyncClient(async () => {
    if (!documentId.value) return null;

    return await orpc.document.get({
      documentId: documentId.value,
    });
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
