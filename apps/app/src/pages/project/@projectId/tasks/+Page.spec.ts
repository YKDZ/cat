import {
  BatchAutoTranslationInvocationSchema,
  type TaskKind,
  TaskKindSchema,
  type TaskState,
  TaskStateSchema,
} from "@cat/shared";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "#/utils/i18n.ts";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  detail: vi.fn(),
  list: vi.fn(),
  resume: vi.fn(),
  retry: vi.fn(),
  useData: vi.fn(),
}));

vi.mock("vike-vue/useData", () => ({ useData: mocks.useData }));

vi.mock("#/rpc/orpc.ts", () => ({
  orpc: {
    task: {
      cancel: mocks.cancel,
      detail: mocks.detail,
      list: mocks.list,
      resume: mocks.resume,
      retry: mocks.retry,
    },
  },
}));

import TaskPage from "./+Page.vue";

const projectId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";

type TaskTableRow = {
  id: string;
  task: TaskKind;
  state: TaskState;
  createdAt: Date | string;
  updatedAt: Date | string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
};

const task: TaskTableRow = {
  id: taskId,
  task: TaskKindSchema.parse({
    kind: "BATCH_AUTO_TRANSLATION",
    payload: {
      invocation: BatchAutoTranslationInvocationSchema.parse({
        projectId,
        contentNodeIds: [],
        elementIds: [101],
        sortMode: "structure",
        languageId: "zh-Hans",
        minMemorySimilarity: 0.72,
        maxMemoryAmount: 3,
        memoryVectorStorage: {
          pluginId: "test.vector",
          serviceId: "memory",
          serviceType: "VECTOR_STORAGE",
          scopeType: "GLOBAL",
          scopeId: "",
        },
        translationVectorStorage: {
          pluginId: "test.vector",
          serviceId: "translation",
          serviceType: "VECTOR_STORAGE",
          scopeType: "GLOBAL",
          scopeId: "",
        },
        vectorizer: {
          pluginId: "test.vectorizer",
          serviceId: "default",
          serviceType: "TEXT_VECTORIZER",
          scopeType: "GLOBAL",
          scopeId: "",
        },
        translatorId: "33333333-3333-4333-8333-333333333333",
        memoryIds: [],
        glossaryIds: [],
      }),
      cancelable: true,
    },
  }),
  state: TaskStateSchema.parse({
    status: "PENDING",
    scope: { type: "PROJECT", id: projectId },
    actor: { type: "USER", id: "33333333-3333-4333-8333-333333333333" },
    resources: [{ type: "PROJECT", id: projectId }],
    revision: 0,
    progressCurrent: null,
    progressTotal: null,
    runtime: {
      kind: "BATCH_AUTO_TRANSLATION",
      runId: null,
      dispatchClaimId: null,
      dispatchClaimExpiresAt: null,
      dispatchAttemptCount: 0,
      lastTransitionRequestId: null,
      lastProjectedEventSequence: null,
      phase: null,
      result: null,
    },
    currentFailureId: null,
    retryOfTaskId: null,
  }),
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  startedAt: null,
  finishedAt: null,
};

describe("Task page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useData.mockReturnValue({
      pageError: null,
      projectId,
      tasks: { items: [task], hasMore: false, nextCursor: null },
    });
    mocks.detail.mockResolvedValue({ task, currentFailure: null });
  });

  it("renders strict batch invocation details without a branch field", async () => {
    const wrapper = mount(TaskPage, {
      global: {
        plugins: [i18n],
        stubs: {
          ProjectPageDataError: true,
          TaskTable: {
            props: ["data"],
            emits: ["detail"],
            template:
              '<button data-testid="detail" @click="$emit(\'detail\', data[0].id)">detail</button>',
          },
        },
      },
    });

    await wrapper.get('[data-testid="detail"]').trigger("click");
    await flushPromises();

    expect(mocks.detail).toHaveBeenCalledWith({ projectId, taskId });
    expect(wrapper.text()).toContain("调用参数");
    expect(wrapper.text()).toContain("最低相似度");
    expect(wrapper.text()).not.toContain("分支");
  });
});
