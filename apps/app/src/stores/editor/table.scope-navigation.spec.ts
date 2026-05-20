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
  getElementTranslationStatus: vi.fn(),
  loadPage: vi.fn(),
  setCurrentPage: vi.fn(),
  currentElementContentNodeId: undefined as string | undefined,
  scope: null as MockScope | null,
}));

vi.mock("@pinia/colada", async () => {
  const { ref } = await import("vue");

  return {
    useQuery: vi.fn(({ placeholderData }: { placeholderData: unknown }) => ({
      state: ref({ data: placeholderData }),
      refresh: vi.fn(async () => undefined),
    })),
    useQueryCache: vi.fn(() => ({
      invalidateQueries: vi.fn(),
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
      projectId: computed(() => mocks.scope?.projectId),
      languageToId: computed(() => mocks.scope?.languageToId),
      branchId: computed(() => mocks.scope?.branchId),
      contentNodeIds: computed(() => mocks.scope?.contentNodeIds ?? []),
      searchQuery: computed(() => mocks.scope?.searchQuery ?? ""),
      statusFilter: computed(() => mocks.scope?.statusFilter ?? "all"),
      pageSize: computed(() => mocks.scope?.pageSize ?? 16),
      currentPage: computed(() => mocks.scope?.page ?? 1),
      scope: computed(() => mocks.scope),
      currentElementContentNodeId: computed({
        get: () => mocks.currentElementContentNodeId,
        set: (value: string | undefined) => {
          mocks.currentElementContentNodeId = value;
        },
      }),
      setCurrentPage(value: number) {
        mocks.setCurrentPage(value);
        if (!mocks.scope) return;
        mocks.scope = {
          ...mocks.scope,
          page: value,
        };
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
      storedElements: computed(() => []),
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
    mocks.getElementTranslationStatus.mockReset();
    mocks.loadPage.mockReset();
    mocks.setCurrentPage.mockReset();
    mocks.currentElementContentNodeId = undefined;
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
      ...mocks.scope,
      elementId: 1234,
      pageSize: 16,
    });
    expect(mocks.getFirstElement).toHaveBeenCalledWith(mocks.scope);
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
    await store.toElement(1234);

    expect(mocks.getFirstElement).toHaveBeenCalledWith(mocks.scope);
    expect(mocks.navigate).toHaveBeenCalledWith(
      `/editor/project/${projectId}/zh-Hans/empty?nodes=${nodeId}&q=needle&status=translated&sort=reuse-first&page=2&branchId=7`,
    );
    expect(store.elementId).toBeNull();
  });
});
