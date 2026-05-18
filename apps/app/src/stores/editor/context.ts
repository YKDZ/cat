import type { EditorScope, EditorScopeView } from "@cat/shared";

import { EditorScopeSchema } from "@cat/shared";
import { useQuery } from "@pinia/colada";
import { defineStore, storeToRefs } from "pinia";
import { computed, ref } from "vue";

import { orpc } from "@/rpc/orpc";
import { useBranchStore } from "@/stores/branch";

export const useEditorContextStore = defineStore("editorContext", () => {
  const projectId = ref<string | undefined>();
  const languageToId = ref<string | undefined>();
  const branchId = ref<number | undefined>();
  const contentNodeIds = ref<string[]>([]);
  const searchQuery = ref("");
  const statusFilter = ref<EditorScope["statusFilter"]>("all");
  const pageSize = ref(16);
  const currentPage = ref(1);
  const currentElementContentNodeId = ref<string | undefined>();

  const branchStore = useBranchStore();
  const { currentBranchId } = storeToRefs(branchStore);

  const scope = computed<EditorScope | null>(() => {
    if (!projectId.value || !languageToId.value) return null;

    return EditorScopeSchema.parse({
      projectId: projectId.value,
      languageToId: languageToId.value,
      branchId: branchId.value ?? currentBranchId.value ?? undefined,
      contentNodeIds: contentNodeIds.value,
      searchQuery: searchQuery.value,
      statusFilter: statusFilter.value,
      page: currentPage.value,
      pageSize: pageSize.value,
    });
  });

  const { state: projectState, refresh: refreshProject } = useQuery({
    key: () => ["editor-project", projectId.value ?? null],
    query: async () => {
      if (!projectId.value) return null;
      return await orpc.project.get({ projectId: projectId.value });
    },
    enabled: () => !import.meta.env.SSR && !!projectId.value,
  });

  const { state: scopeState, refresh: refreshScope } = useQuery({
    key: () => ["editor-scope", scope.value],
    query: async (): Promise<EditorScopeView | null> => {
      if (!scope.value) return null;
      return await orpc.editor.resolveScope(scope.value);
    },
    enabled: () => !import.meta.env.SSR && !!scope.value,
  });

  const scopeView = computed(() => scopeState.value.data ?? null);
  const project = computed(() => projectState.value.data ?? null);
  const contentNodeFilters = computed(
    () => scopeView.value?.contentNodeFilters ?? [],
  );
  const activeContentNodeId = computed(
    () =>
      currentElementContentNodeId.value ??
      (contentNodeIds.value.length === 1 ? contentNodeIds.value[0] : undefined),
  );

  const setScope = (next: EditorScope) => {
    projectId.value = next.projectId;
    languageToId.value = next.languageToId;
    branchId.value = next.branchId;

    // Only update the array when its content actually changes to avoid
    // creating a new reference that would spuriously trigger the scope watcher.
    const newIds = [...new Set(next.contentNodeIds)];
    if (
      newIds.length !== contentNodeIds.value.length ||
      newIds.some((id, i) => id !== contentNodeIds.value[i])
    ) {
      contentNodeIds.value = newIds;
    }

    searchQuery.value = next.searchQuery;
    statusFilter.value = next.statusFilter;
    currentPage.value = next.page;
    pageSize.value = next.pageSize;
    currentElementContentNodeId.value = undefined;
  };

  const clearContentNodeFilter = (id: string) => {
    contentNodeIds.value = contentNodeIds.value.filter((item) => item !== id);
    currentPage.value = 1;
  };

  const setContentNodeFilters = (ids: string[]) => {
    contentNodeIds.value = [...new Set(ids)];
    currentPage.value = 1;
  };

  const setSearchQuery = (value: string) => {
    searchQuery.value = value;
  };

  const setStatusFilter = (value: EditorScope["statusFilter"]) => {
    statusFilter.value = value;
  };

  const setCurrentPage = (value: number) => {
    currentPage.value = value;
  };

  const setPageSize = (value: number) => {
    pageSize.value = value;
    currentPage.value = 1;
  };

  const refresh = async () => {
    await Promise.all([refreshProject(), refreshScope()]);
  };

  return {
    projectId,
    languageToId,
    branchId,
    contentNodeIds,
    searchQuery,
    statusFilter,
    pageSize,
    currentPage,
    currentElementContentNodeId,
    scope,
    scopeView,
    project,
    contentNodeFilters,
    activeContentNodeId,
    contentNodeId: activeContentNodeId,
    setScope,
    clearContentNodeFilter,
    setContentNodeFilters,
    setSearchQuery,
    setStatusFilter,
    setCurrentPage,
    setPageSize,
    refresh,
  };
});
