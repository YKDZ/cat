import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { trpc } from "@cat/app-api/trpc/client";
import { computedAsyncClient } from "@/app/utils/vue";

export const useEditorContextStore = defineStore("editorContext", () => {
  const documentId = ref<string | null>(null);
  const languageToId = ref<string | null>(null);
  const pageSize = ref(16);
  // 从 1 开始
  const currentPage = ref(1);

  const document = computedAsyncClient(async () => {
    if (!documentId.value) return null;

    return await trpc.document.get.query({
      id: documentId.value,
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
