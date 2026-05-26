import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  listReviewableElements: vi.fn(),
  countReviewableElements: vi.fn(),
  getReviewableElement: vi.fn(),
  submitAction: vi.fn(),
  invalidateQueries: vi.fn(),
  setElementContextForExternalWorkbench: vi.fn(),
}));

vi.mock("vike/client/router", () => ({
  navigate: mocks.navigate,
}));

vi.mock("@pinia/colada", async () => {
  const { ref } = await import("vue");

  return {
    useQuery: vi.fn(
      ({
        placeholderData,
        query,
      }: {
        placeholderData: unknown;
        query: () => Promise<unknown>;
      }) => {
        const state = ref({ data: placeholderData });
        return {
          state,
          refresh: vi.fn(async () => {
            state.value = { data: await query() };
            return state.value.data;
          }),
        };
      },
    ),
    useQueryCache: vi.fn(() => ({
      invalidateQueries: mocks.invalidateQueries,
    })),
  };
});

vi.mock("@/rpc/orpc", () => ({
  orpc: {
    qaReview: {
      listReviewableElements: mocks.listReviewableElements,
      countReviewableElements: mocks.countReviewableElements,
      getReviewableElement: mocks.getReviewableElement,
      submitAction: mocks.submitAction,
    },
  },
}));

vi.mock("@/stores/editor/context", async () => {
  const { defineStore } = await import("pinia");
  const { ref, computed } = await import("vue");

  return {
    useEditorContextStore: defineStore("editorContextQaWorkbenchSpec", () => {
      const scope = ref({
        projectId: "11111111-1111-4111-8111-111111111111",
        languageToId: "zh-Hans",
        contentNodeIds: [],
        searchQuery: "",
        statusFilter: "all" as const,
        sortMode: "structure" as const,
        page: 1,
        pageSize: 16,
      });

      return {
        scope: computed(() => scope.value),
      };
    }),
  };
});

vi.mock("@/stores/editor/table", async () => {
  const { defineStore } = await import("pinia");

  return {
    useEditorTableStore: defineStore("editorTableQaWorkbenchSpec", () => ({
      setElementContextForExternalWorkbench:
        mocks.setElementContextForExternalWorkbench,
    })),
  };
});

import { useQaReviewWorkbenchStore } from "./workbench";

describe("useQaReviewWorkbenchStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.navigate.mockReset();
    mocks.listReviewableElements.mockReset();
    mocks.countReviewableElements.mockReset();
    mocks.getReviewableElement.mockReset();
    mocks.submitAction.mockReset();
    mocks.invalidateQueries.mockReset();

    mocks.listReviewableElements.mockResolvedValue([]);
    mocks.countReviewableElements.mockResolvedValue(0);
    mocks.getReviewableElement.mockResolvedValue({
      sourceText: "Apple",
      candidates: [
        {
          queueItem: {
            id: 1,
            optimisticVersion: 1,
          },
          translation: { id: 2, text: "苹果" },
          findings: [],
          annotations: [],
        },
      ],
    });
  });

  it("keeps draft and surfaces error when submitAction fails", async () => {
    const store = useQaReviewWorkbenchStore();

    store.selectedElementId = 1;
    store.selectedQueueItemId = 1;
    store.selectedTranslationId = 2;
    store.noteBody = "Draft note";
    await store.refreshAll();

    mocks.submitAction.mockRejectedValueOnce(new Error("network failed"));

    const result = await store.submitAction("APPROVE");

    expect(result).toBeNull();
    expect(store.noteBody).toBe("Draft note");
    expect(store.submitError).toBe("network failed");
  });
});
