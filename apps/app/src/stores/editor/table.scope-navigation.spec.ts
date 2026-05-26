import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockScope = {
  projectId: string;
  languageToId: string;
  branchId?: number;
  contentNodeIds: string[];
  searchQuery: string;
  statusFilter:
    | "all"
    | "untranslated"
    | "translated"
    | "approved"
    | "unapproved";
  sortMode: "structure" | "reuse-first";
  page: number;
  pageSize: number;
};

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getElementPageIndex: vi.fn(),
  getFirstElement: vi.fn(),
  listElements: vi.fn(),
  countElements: vi.fn(),
  createTranslation: vi.fn(),
  invalidateQueries: vi.fn(),
  getElementTranslationStatus: vi.fn(),
  loadPage: vi.fn(),
  setCurrentPage: vi.fn(),
  canWrite: true,
  currentElementContentNodeId: undefined as string | undefined,
  scope: null as MockScope | null,
  scopeRef: null as { value: MockScope | null } | null,
  loadedPages: new Map<
    number,
    Array<{ id: number; primaryContentNodeId?: string; languageId?: string }>
  >(),
}));

vi.mock("@pinia/colada", async () => {
  const { ref } = await import("vue");

  return {
    useQuery: vi.fn(({ placeholderData }: { placeholderData: unknown }) => ({
      state: ref({ data: placeholderData }),
      refresh: vi.fn(async () => undefined),
    })),
    useQueryCache: vi.fn(() => ({
      invalidateQueries: mocks.invalidateQueries,
    })),
  };
});

vi.mock("vike/client/router", () => ({
  navigate: mocks.navigate,
}));

vi.mock("@/rpc/orpc", () => ({
  orpc: {
    editor: {
      countElements: mocks.countElements,
      getElementPageIndex: mocks.getElementPageIndex,
      getFirstElement: mocks.getFirstElement,
      listElements: mocks.listElements,
    },
    translation: {
      create: mocks.createTranslation,
    },
    document: {
      getElementTranslationStatus: mocks.getElementTranslationStatus,
    },
    project: {
      get: vi.fn(),
    },
  },
}));

vi.mock("@/stores/editor/context.ts", async () => {
  const { defineStore } = await import("pinia");
  const { computed } = await import("vue");

  return {
    useEditorContextStore: defineStore("editorTableContextSpec", () => ({
      projectId: computed(() => mocks.scopeRef?.value?.projectId),
      languageToId: computed(() => mocks.scopeRef?.value?.languageToId),
      branchId: computed(() => mocks.scopeRef?.value?.branchId),
      contentNodeIds: computed(
        () => mocks.scopeRef?.value?.contentNodeIds ?? [],
      ),
      searchQuery: computed(() => mocks.scopeRef?.value?.searchQuery ?? ""),
      statusFilter: computed(
        () => mocks.scopeRef?.value?.statusFilter ?? "all",
      ),
      pageSize: computed(() => mocks.scopeRef?.value?.pageSize ?? 16),
      currentPage: computed(() => mocks.scopeRef?.value?.page ?? 1),
      scope: computed(() => mocks.scopeRef?.value ?? null),
      currentElementContentNodeId: computed({
        get: () => mocks.currentElementContentNodeId,
        set: (value: string | undefined) => {
          mocks.currentElementContentNodeId = value;
        },
      }),
      setCurrentPage(value: number) {
        mocks.setCurrentPage(value);
        if (!mocks.scopeRef?.value) return;
        mocks.scopeRef.value = {
          ...mocks.scopeRef.value,
          page: value,
        };
        mocks.scope = mocks.scopeRef.value;
      },
      setSearchQuery: vi.fn(),
      setStatusFilter: vi.fn(),
    })),
  };
});

vi.mock("@/stores/editor/element.ts", async () => {
  const { defineStore } = await import("pinia");
  const { computed } = await import("vue");

  return {
    useEditorElementStore: defineStore("editorElementSpec", () => ({
      loadedPages: mocks.loadedPages,
      storedElements: computed(() =>
        [...mocks.loadedPages.entries()]
          .sort((a, b) => a[0] - b[0])
          .flatMap(([, elements]) => elements),
      ),
      pendingElements: computed(() => new Set<number>()),
      async loadPage(page: number) {
        return await mocks.loadPage(page);
      },
      setElementPending: vi.fn(),
    })),
  };
});

vi.mock("@/stores/profile.ts", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");

  return {
    useProfileStore: defineStore("editorProfileSpec", () => {
      const editorMemoryAutoCreateMemory = ref(false);

      return {
        editorMemoryAutoCreateMemory,
      };
    }),
  };
});

vi.mock("@/stores/write-capability.ts", async () => {
  const { defineStore } = await import("pinia");
  const { computed } = await import("vue");

  return {
    useProjectWriteCapabilityStore: defineStore(
      "editorWriteCapabilitySpec",
      () => ({
        canWrite: computed(() => mocks.canWrite),
        disabledReason: computed(() =>
          mocks.canWrite
            ? null
            : "当前选择 main，但你的写入需要通过分支完成。请选择一个可写分支。",
        ),
      }),
    ),
  };
});

import { ref } from "vue";

import { useEditorTableStore } from "./table";

describe("useEditorTableStore scope navigation", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const nodeId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    setActivePinia(createPinia());

    mocks.navigate.mockReset();
    mocks.navigate.mockResolvedValue(undefined);
    mocks.getElementPageIndex.mockReset();
    mocks.getFirstElement.mockReset();
    mocks.listElements.mockReset();
    mocks.countElements.mockReset();
    mocks.createTranslation.mockReset();
    mocks.createTranslation.mockResolvedValue(undefined);
    mocks.invalidateQueries.mockReset();
    mocks.getElementTranslationStatus.mockReset();
    mocks.loadPage.mockReset();
    mocks.setCurrentPage.mockReset();
    mocks.canWrite = true;
    mocks.currentElementContentNodeId = undefined;
    mocks.loadedPages.clear();
    mocks.scope = {
      projectId,
      languageToId: "zh-Hans",
      branchId: 7,
      contentNodeIds: [nodeId],
      searchQuery: "needle",
      statusFilter: "translated",
      sortMode: "reuse-first",
      page: 2,
      pageSize: 16,
    };
    mocks.scopeRef = ref(mocks.scope);
  });

  it("selects an already-loaded element without resolving its page on the server", async () => {
    const contentNodeId = "33333333-3333-4333-8333-333333333333";
    mocks.loadedPages.set(1, [
      {
        id: 1234,
        primaryContentNodeId: contentNodeId,
      },
    ]);

    const store = useEditorTableStore();
    await store.toElement(1234);

    expect(mocks.getElementPageIndex).not.toHaveBeenCalled();
    expect(mocks.loadPage).not.toHaveBeenCalled();
    expect(mocks.setCurrentPage).toHaveBeenCalledWith(2);
    expect(store.elementId).toBe(1234);
    expect(mocks.currentElementContentNodeId).toBe(contentNodeId);
  });

  it("falls back to the first element without widening the active scope", async () => {
    mocks.getElementPageIndex.mockResolvedValueOnce(null);
    mocks.getFirstElement.mockResolvedValueOnce({
      id: 99,
      primaryContentNodeId: "33333333-3333-4333-8333-333333333333",
    });

    const store = useEditorTableStore();
    await store.toElement(1234);

    expect(mocks.getElementPageIndex).toHaveBeenCalledWith({
      ...mocks.scopeRef?.value,
      elementId: 1234,
      pageSize: 16,
    });
    expect(mocks.getFirstElement).toHaveBeenCalledWith(mocks.scopeRef?.value);
    expect(mocks.getFirstElement.mock.calls[0]?.[0]).toMatchObject({
      searchQuery: "needle",
      statusFilter: "translated",
    });
    expect(mocks.navigate).toHaveBeenCalledWith(
      `/editor/project/${projectId}/zh-Hans/99?nodes=${nodeId}&q=needle&status=translated&sort=reuse-first&page=2&branchId=7`,
    );
    expect(mocks.currentElementContentNodeId).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
  });

  it("navigates to the scoped empty state when the current filters match nothing", async () => {
    mocks.getElementPageIndex.mockResolvedValueOnce(null);
    mocks.getFirstElement.mockResolvedValueOnce(null);

    const store = useEditorTableStore();
    store.elementId = 88;
    store.translationValue = "待提交草稿";
    await store.toElement(1234);

    expect(mocks.getFirstElement).toHaveBeenCalledWith(mocks.scopeRef?.value);
    expect(mocks.navigate).toHaveBeenCalledWith(
      `/editor/project/${projectId}/zh-Hans/empty?nodes=${nodeId}&q=needle&status=translated&sort=reuse-first&page=2&branchId=7`,
    );
    expect(store.elementId).toBeNull();
    expect(store.translationValue).toBe("");
  });

  it("clears the draft when submit-and-continue selects the next untranslated element", async () => {
    const nextContentNodeId = "44444444-4444-4444-8444-444444444444";
    mocks.loadedPages.set(1, [
      { id: 1, primaryContentNodeId: nodeId },
      { id: 2, primaryContentNodeId: nextContentNodeId },
    ]);
    mocks.getFirstElement.mockResolvedValueOnce({
      id: 2,
      primaryContentNodeId: nextContentNodeId,
    });

    const store = useEditorTableStore();
    store.elementId = 1;
    store.translationValue = "刚刚提交的译文";

    await store.toNextUntranslated();

    expect(mocks.getFirstElement).toHaveBeenCalledWith({
      ...mocks.scopeRef?.value,
      statusFilter: "untranslated",
      afterElementId: 1,
    });
    expect(store.elementId).toBe(2);
    expect(store.translationValue).toBe("");
    expect(mocks.currentElementContentNodeId).toBe(nextContentNodeId);
  });

  it("syncs external workbench element context", () => {
    const store = useEditorTableStore();

    store.setElementContextForExternalWorkbench({
      elementId: 10,
      primaryContentNodeId: "node-1",
      sourceLanguageId: "en",
    });

    expect(store.elementId).toBe(10);
    expect(store.elementLanguageId).toBe("en");
    expect(mocks.currentElementContentNodeId).toBe("node-1");
  });

  it("submits translations with the active project and branch scope", async () => {
    const store = useEditorTableStore();
    store.elementId = 10;
    store.translationValue = "分支译文";

    await store.translate();

    expect(mocks.createTranslation).toHaveBeenCalledWith({
      projectId,
      branchId: 7,
      elementId: 10,
      languageId: "zh-Hans",
      text: "分支译文",
      createMemory: false,
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      key: ["translations", 10, "zh-Hans", 7],
      exact: true,
    });
  });

  it("restores drafts per branch scope instead of leaking across branches", () => {
    const store = useEditorTableStore();
    store.elementId = 10;
    store.translationValue = "branch-7 draft";

    store.stashDraftForCurrentScope();

    const scopeRef = mocks.scopeRef;
    if (!scopeRef?.value) {
      throw new Error("Expected scope ref to be initialized");
    }

    scopeRef.value = {
      ...scopeRef.value,
      branchId: 8,
    };
    mocks.scope = scopeRef.value;
    store.restoreDraftForCurrentScope();
    expect(store.translationValue).toBe("");

    store.translationValue = "branch-8 draft";
    store.stashDraftForCurrentScope();

    scopeRef.value = {
      ...scopeRef.value,
      branchId: 7,
    };
    mocks.scope = scopeRef.value;
    store.restoreDraftForCurrentScope();

    expect(store.translationValue).toBe("branch-7 draft");
  });

  it("keeps the current element selection when changing pages", async () => {
    mocks.loadPage.mockResolvedValueOnce([
      {
        id: 9001,
        primaryContentNodeId: "55555555-5555-4555-8555-555555555555",
      },
    ]);

    const store = useEditorTableStore();
    store.elementId = 1234;

    await store.toPage(3);

    expect(mocks.setCurrentPage).toHaveBeenCalledWith(3);
    expect(mocks.loadPage).toHaveBeenCalledWith(2);
    expect(mocks.navigate).toHaveBeenCalledWith(
      `/editor/project/${projectId}/zh-Hans/1234?nodes=${nodeId}&q=needle&status=translated&sort=reuse-first&page=3&branchId=7`,
    );
  });

  it("keeps selected element data after list cache refresh during pagination", () => {
    mocks.loadedPages.set(1, [
      {
        id: 1234,
        languageId: "en",
        primaryContentNodeId: "66666666-6666-4666-8666-666666666666",
      },
    ]);

    const store = useEditorTableStore();
    expect(store.selectLoadedElement(1234)).toBe(true);

    mocks.loadedPages.clear();

    expect(store.element?.id).toBe(1234);
    expect(store.elementLanguageId).toBe("en");
  });
});
