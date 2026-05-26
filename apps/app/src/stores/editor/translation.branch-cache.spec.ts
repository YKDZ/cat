import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";

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
  pageSize: number;
};

type QueryOptions = {
  key: () => unknown[];
  query: () => Promise<unknown>;
  enabled: () => boolean;
};

type AsyncStream = {
  signal: AbortSignal;
  push: (value: unknown) => void;
  close: () => void;
  iterable: AsyncIterable<unknown>;
};

const mocks = vi.hoisted(() => ({
  queryOptions: null as QueryOptions | null,
  getAll: vi.fn(),
  onCreate: vi.fn(),
  setQueryData: vi.fn(),
  setElementPending: vi.fn(),
  updateElementStatus: vi.fn(async () => undefined),
  elementIdRef: null as ReturnType<typeof ref<number | null>> | null,
  languageToIdRef: null as ReturnType<typeof ref<string | undefined>> | null,
  scopeRef: null as ReturnType<typeof ref<MockScope | null>> | null,
  streams: [] as AsyncStream[],
}));

const createAsyncStream = (signal: AbortSignal): AsyncStream => {
  const queue: unknown[] = [];
  const resolvers: Array<(result: IteratorResult<unknown>) => void> = [];
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    while (resolvers.length > 0) {
      const resolve = resolvers.shift();
      resolve?.({ value: undefined, done: true });
    }
  };

  signal.addEventListener("abort", close, { once: true });

  return {
    signal,
    push: (value: unknown) => {
      if (closed || signal.aborted) return;
      const resolve = resolvers.shift();
      if (resolve) {
        resolve({ value, done: false });
        return;
      }
      queue.push(value);
    },
    close,
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            if (queue.length > 0) {
              return {
                value: queue.shift(),
                done: false,
              };
            }

            if (closed || signal.aborted) {
              return {
                value: undefined,
                done: true,
              };
            }

            return await new Promise<IteratorResult<unknown>>((resolve) => {
              resolvers.push(resolve);
            });
          },
          return: async () => {
            close();
            return {
              value: undefined,
              done: true,
            };
          },
        };
      },
    },
  };
};

const flushStore = async () => {
  await nextTick();
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
};

vi.mock("@pinia/colada", async () => {
  const { ref } = await import("vue");

  return {
    useQuery: vi.fn((options: QueryOptions) => {
      mocks.queryOptions = options;
      return {
        state: ref({ data: [] }),
        refresh: vi.fn(async () => undefined),
        refetch: vi.fn(async () => undefined),
      };
    }),
    useQueryCache: vi.fn(() => ({
      setQueryData: mocks.setQueryData,
    })),
  };
});

vi.mock("@/rpc/orpc", () => ({
  orpc: {
    translation: {
      getAll: mocks.getAll,
      onCreate: mocks.onCreate,
    },
  },
}));

vi.mock("@/stores/editor/table.ts", async () => {
  const { defineStore } = await import("pinia");

  return {
    useEditorTableStore: defineStore("editorTranslationTableSpec", () => ({
      elementId: mocks.elementIdRef,
    })),
  };
});

vi.mock("@/stores/editor/context.ts", async () => {
  const { defineStore } = await import("pinia");
  const { computed } = await import("vue");

  return {
    useEditorContextStore: defineStore("editorTranslationContextSpec", () => ({
      languageToId: mocks.languageToIdRef,
      scope: computed(() => mocks.scopeRef?.value ?? null),
    })),
  };
});

vi.mock("@/stores/editor/element.ts", async () => {
  const { defineStore } = await import("pinia");

  return {
    useEditorElementStore: defineStore("editorTranslationElementSpec", () => ({
      setElementPending: mocks.setElementPending,
      updateElementStatus: mocks.updateElementStatus,
    })),
  };
});

import { useEditorTranslationStore } from "./translation.ts";

describe("useEditorTranslationStore branch cache", () => {
  beforeEach(() => {
    setActivePinia(createPinia());

    mocks.elementIdRef = ref(1);
    mocks.languageToIdRef = ref("zh-Hans");
    mocks.scopeRef = ref({
      projectId: "11111111-1111-4111-8111-111111111111",
      languageToId: "zh-Hans",
      branchId: 7,
      contentNodeIds: [],
      searchQuery: "",
      statusFilter: "all",
      sortMode: "structure",
      pageSize: 16,
    });
    mocks.queryOptions = null;
    mocks.getAll.mockReset();
    mocks.getAll.mockResolvedValue([]);
    mocks.onCreate.mockReset();
    mocks.onCreate.mockImplementation(
      async (_scope: MockScope, options: { signal: AbortSignal }) => {
        const stream = createAsyncStream(options.signal);
        mocks.streams.push(stream);
        return stream.iterable;
      },
    );
    mocks.setQueryData.mockReset();
    mocks.setElementPending.mockReset();
    mocks.updateElementStatus.mockReset();
    mocks.streams = [];
  });

  it("builds query keys and request bodies with branchId isolation", async () => {
    useEditorTranslationStore();
    await flushStore();

    expect(mocks.queryOptions?.key()).toEqual([
      "translations",
      1,
      "zh-Hans",
      7,
    ]);

    await mocks.queryOptions?.query();
    expect(mocks.getAll).toHaveBeenCalledWith({
      elementId: 1,
      languageId: "zh-Hans",
      branchId: 7,
    });

    mocks.scopeRef!.value = {
      ...mocks.scopeRef!.value!,
      branchId: undefined,
    };

    expect(mocks.queryOptions?.key()).toEqual([
      "translations",
      1,
      "zh-Hans",
      null,
    ]);

    await mocks.queryOptions?.query();
    expect(mocks.getAll).toHaveBeenLastCalledWith({
      elementId: 1,
      languageId: "zh-Hans",
      branchId: undefined,
    });
  });

  it("scopes subscription cache updates by branchId and aborts stale streams", async () => {
    useEditorTranslationStore();
    await flushStore();

    expect(mocks.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 7 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    const branchStream = mocks.streams[0];
    if (!branchStream) {
      throw new Error("Expected the branch stream to be created");
    }

    branchStream.push({
      id: 11,
      text: "main translation event",
      vote: 0,
      translatorId: null,
      translatableElementId: 1,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    });
    await flushStore();
    await flushStore();

    expect(mocks.setElementPending).toHaveBeenCalledWith(1, false);
    expect(mocks.updateElementStatus).toHaveBeenCalledWith(1);
    expect(mocks.setQueryData).toHaveBeenCalledWith(
      ["translations", 1, "zh-Hans", 7],
      expect.any(Function),
    );

    const branchUpdater = mocks.setQueryData.mock.calls[0]?.[1];
    if (typeof branchUpdater !== "function") {
      throw new Error("Expected a branch cache updater function");
    }

    expect(branchUpdater([])).toEqual([
      expect.objectContaining({ kind: "main", id: 11 }),
    ]);

    mocks.scopeRef!.value = {
      ...mocks.scopeRef!.value!,
      branchId: undefined,
    };
    await flushStore();

    expect(branchStream.signal.aborted).toBe(true);
    expect(mocks.onCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ branchId: undefined }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    const callCountBeforeStalePush = mocks.setQueryData.mock.calls.length;
    branchStream.push({
      id: 99,
      text: "stale branch event",
      vote: 0,
      translatorId: null,
      translatableElementId: 1,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
    });
    await flushStore();
    expect(mocks.setQueryData.mock.calls).toHaveLength(
      callCountBeforeStalePush,
    );

    const mainStream = mocks.streams[1];
    if (!mainStream) {
      throw new Error("Expected the main stream to be created");
    }

    mainStream.push({
      id: 12,
      text: "main translation event 2",
      vote: 0,
      translatorId: null,
      translatableElementId: 1,
      createdAt: new Date("2024-01-02T00:00:00.000Z"),
    });
    await flushStore();
    await flushStore();

    expect(mocks.setQueryData).toHaveBeenLastCalledWith(
      ["translations", 1, "zh-Hans", null],
      expect.any(Function),
    );
  });
});
