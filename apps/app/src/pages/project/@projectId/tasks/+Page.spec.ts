import {
  BatchAutoTranslationInvocationSchema,
  type TaskKind,
  TaskKindSchema,
  type TaskState,
  TaskStateSchema,
} from "@cat/shared";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "#/utils/i18n.ts";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  detail: vi.fn(),
  list: vi.fn(),
  pageContext: {
    urlParsed: { searchOriginal: "" },
    urlPathname: "/project/tasks",
  },
  resume: vi.fn(),
  retry: vi.fn(),
  useData: vi.fn(),
}));

vi.mock("vike-vue/useData", () => ({ useData: mocks.useData }));

vi.mock("vike-vue/usePageContext", () => ({
  usePageContext: () => mocks.pageContext,
}));

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

enableAutoUnmount(afterEach);

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
    mocks.pageContext.urlParsed = { searchOriginal: "" };
    mocks.detail.mockResolvedValue({ task, currentFailure: null });
  });

  it("opens the authorized task identified by the taskId query", async () => {
    mocks.pageContext.urlParsed = { searchOriginal: `?taskId=${taskId}` };
    mocks.useData.mockReturnValue({
      pageError: null,
      projectId,
      tasks: { items: [task], hasMore: false, nextCursor: null },
      selectedDetail: { task, currentFailure: null },
      detailAvailability: null,
    });

    const wrapper = mount(TaskPage, {
      global: {
        plugins: [i18n],
        stubs: { ProjectPageDataError: true, TaskTable: true },
      },
    });

    await flushPromises();

    expect(mocks.detail).not.toHaveBeenCalled();
    expect(wrapper.get('[aria-label="任务详情"]').text()).toContain(taskId);
  });

  it("keeps the task list when the taskId query is invalid or unavailable", async () => {
    mocks.pageContext.urlParsed = { searchOriginal: "?taskId=not-a-task-id" };
    const invalidWrapper = mount(TaskPage, {
      global: { plugins: [i18n], stubs: { ProjectPageDataError: true } },
    });

    await flushPromises();

    expect(mocks.detail).not.toHaveBeenCalled();
    expect(invalidWrapper.text()).toContain("批量自动翻译");

    mocks.pageContext.urlParsed = { searchOriginal: `?taskId=${taskId}` };
    mocks.useData.mockReturnValue({
      pageError: null,
      projectId,
      tasks: { items: [task], hasMore: false, nextCursor: null },
      selectedDetail: undefined,
      detailAvailability: "unavailable",
    });
    const unavailableWrapper = mount(TaskPage, {
      global: { plugins: [i18n], stubs: { ProjectPageDataError: true } },
    });

    await flushPromises();

    expect(mocks.detail).not.toHaveBeenCalled();
    expect(unavailableWrapper.text()).toContain("批量自动翻译");
    expect(unavailableWrapper.find('[aria-label="任务详情"]').exists()).toBe(
      false,
    );
    expect(unavailableWrapper.text()).toContain("任务详情不可用");
  });

  it("paginates with cursors and resets to the first page when filtering", async () => {
    const nextCursor = {
      updatedAt: "2026-08-01T00:00:00.000Z",
      id: taskId,
    };
    mocks.useData.mockReturnValue({
      pageError: null,
      projectId,
      tasks: { items: [task], hasMore: true, nextCursor },
    });
    mocks.list.mockResolvedValue({
      items: [task],
      hasMore: false,
      nextCursor: null,
    });
    const wrapper = mount(TaskPage, {
      global: {
        plugins: [i18n],
        stubs: {
          ProjectPageDataError: true,
          TaskTable: {
            emits: ["next", "previous", "update:status"],
            template: `
              <button data-testid="next" @click="$emit('next')">next</button>
              <button data-testid="previous" @click="$emit('previous')">previous</button>
              <button data-testid="filter" @click="$emit('update:status', 'FAILED')">filter</button>
            `,
          },
        },
      },
    });

    await wrapper.get('[data-testid="next"]').trigger("click");
    await flushPromises();
    expect(mocks.list).toHaveBeenLastCalledWith({
      projectId,
      pageSize: 20,
      cursor: nextCursor,
    });

    await wrapper.get('[data-testid="previous"]').trigger("click");
    await flushPromises();
    expect(mocks.list).toHaveBeenLastCalledWith({ projectId, pageSize: 20 });

    await wrapper.get('[data-testid="next"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="filter"]').trigger("click");
    await flushPromises();
    expect(mocks.list).toHaveBeenLastCalledWith({
      projectId,
      pageSize: 20,
      status: "FAILED",
    });
  });

  it("keeps the newest list result and loading state when requests overlap", async () => {
    let resolveRefresh:
      | ((value: {
          items: TaskTableRow[];
          hasMore: boolean;
          nextCursor: null;
        }) => void)
      | undefined;
    let resolveFiltered:
      | ((value: {
          items: TaskTableRow[];
          hasMore: boolean;
          nextCursor: null;
        }) => void)
      | undefined;
    mocks.list
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFiltered = resolve;
          }),
      );
    const filteredTask = {
      ...task,
      state: { ...task.state, status: "FAILED" as const },
    };
    const wrapper = mount(TaskPage, {
      global: {
        plugins: [i18n],
        stubs: {
          ProjectPageDataError: true,
          TaskTable: {
            props: ["data", "loading"],
            emits: ["refresh", "update:status"],
            template: `
              <button data-testid="refresh" @click="$emit('refresh')">refresh</button>
              <button data-testid="filter" @click="$emit('update:status', 'FAILED')">filter</button>
              <output data-testid="loading">{{ loading }}</output>
              <output data-testid="status">{{ data[0]?.state.status }}</output>
            `,
          },
        },
      },
    });

    await wrapper.get('[data-testid="refresh"]').trigger("click");
    await wrapper.get('[data-testid="filter"]').trigger("click");
    expect(wrapper.get('[data-testid="loading"]').text()).toBe("true");

    resolveFiltered?.({
      items: [filteredTask],
      hasMore: false,
      nextCursor: null,
    });
    await flushPromises();
    expect(wrapper.get('[data-testid="loading"]').text()).toBe("false");
    expect(wrapper.get('[data-testid="status"]').text()).toBe("FAILED");

    resolveRefresh?.({ items: [task], hasMore: false, nextCursor: null });
    await flushPromises();
    expect(wrapper.get('[data-testid="status"]').text()).toBe("FAILED");
  });

  it("rolls back a failed filter without leaving filtered rows or state committed", async () => {
    mocks.list.mockRejectedValueOnce(new Error("offline"));
    const wrapper = mount(TaskPage, {
      global: {
        plugins: [i18n],
        stubs: {
          ProjectPageDataError: true,
          TaskTable: {
            props: ["data", "error", "status"],
            emits: ["update:status"],
            template: `
              <button data-testid="filter" @click="$emit('update:status', 'FAILED')">filter</button>
              <output data-testid="status">{{ status }}</output>
              <output data-testid="row">{{ data[0]?.state.status }}</output>
              <output data-testid="error">{{ error }}</output>
            `,
          },
        },
      },
    });

    await wrapper.get('[data-testid="filter"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="status"]').text()).toBe("");
    expect(wrapper.get('[data-testid="row"]').text()).toBe("PENDING");
    expect(wrapper.get('[data-testid="error"]').text()).toContain(
      "任务列表暂时无法加载，请重试",
    );
  });

  it("restores the last successful list when an earlier filter resolves after a later filter fails", async () => {
    let resolvePending:
      | ((value: {
          items: TaskTableRow[];
          hasMore: boolean;
          nextCursor: null;
        }) => void)
      | undefined;
    mocks.list
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePending = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("offline"));
    const wrapper = mount(TaskPage, {
      global: {
        plugins: [i18n],
        stubs: {
          ProjectPageDataError: true,
          TaskTable: {
            props: ["data", "error", "status"],
            emits: ["update:status"],
            template: `
              <button data-testid="pending" @click="$emit('update:status', 'PENDING')">pending</button>
              <button data-testid="failed" @click="$emit('update:status', 'FAILED')">failed</button>
              <output data-testid="status">{{ status }}</output>
              <output data-testid="row">{{ data[0]?.state.status }}</output>
              <output data-testid="error">{{ error }}</output>
            `,
          },
        },
      },
    });

    await wrapper.get('[data-testid="pending"]').trigger("click");
    await wrapper.get('[data-testid="failed"]').trigger("click");
    await flushPromises();
    resolvePending?.({ items: [task], hasMore: false, nextCursor: null });
    await flushPromises();

    expect(wrapper.get('[data-testid="status"]').text()).toBe("");
    expect(wrapper.get('[data-testid="row"]').text()).toBe("PENDING");
    expect(wrapper.get('[data-testid="error"]').text()).toContain(
      "任务列表暂时无法加载，请重试",
    );
  });

  it("clears old detail during popstate and commits only the newest requested task", async () => {
    const otherTaskId = "88888888-8888-4888-8888-888888888888";
    const otherTask = { ...task, id: otherTaskId };
    let resolveDetail:
      | ((value: { task: TaskTableRow; currentFailure: null }) => void)
      | undefined;
    mocks.useData.mockReturnValue({
      pageError: null,
      projectId,
      tasks: { items: [task], hasMore: false, nextCursor: null },
      selectedDetail: { task, currentFailure: null },
      detailAvailability: null,
    });
    mocks.detail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDetail = resolve;
        }),
    );
    globalThis.history.replaceState(
      null,
      "",
      `/project/${projectId}/tasks?taskId=${otherTaskId}`,
    );
    const wrapper = mount(TaskPage, {
      global: {
        plugins: [i18n],
        stubs: { ProjectPageDataError: true, TaskTable: true },
      },
    });

    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await flushPromises();
    expect(wrapper.find('[aria-label="任务详情"]').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').attributes("aria-busy")).toBe("true");
    resolveDetail?.({ task: otherTask, currentFailure: null });
    await flushPromises();
    expect(wrapper.get('[aria-label="任务详情"]').text()).toContain(
      otherTaskId,
    );
    expect(wrapper.get('[aria-label="任务详情"]').text()).not.toContain(taskId);
  });

  it("serializes overlapping task actions for the whole task form", async () => {
    let resolveCancel: (() => void) | undefined;
    mocks.cancel.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCancel = resolve;
        }),
    );
    const wrapper = mount(TaskPage, {
      global: {
        plugins: [i18n],
        stubs: {
          ProjectPageDataError: true,
          TaskTable: {
            props: ["data", "actionBusy"],
            emits: ["cancel", "retry"],
            template: `
              <button data-testid="cancel" @click="$emit('cancel', data[0])">cancel</button>
              <button data-testid="retry" @click="$emit('retry', data[0])">retry</button>
              <output data-testid="busy">{{ actionBusy }}</output>
            `,
          },
        },
      },
    });

    await wrapper.get('[data-testid="cancel"]').trigger("click");
    await wrapper.get('[data-testid="retry"]').trigger("click");

    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="busy"]').text()).toBe("true");

    resolveCancel?.();
    await flushPromises();
    expect(wrapper.get('[data-testid="busy"]').text()).toBe("false");
  });

  it("sends cancel, retry, and resume actions through the task RPC", async () => {
    const retriedTaskId = "66666666-6666-4666-8666-666666666666";
    const resumedTaskId = "77777777-7777-4777-8777-777777777777";
    globalThis.history.replaceState(null, "", `/project/${projectId}/tasks`);
    mocks.pageContext.urlParsed = { searchOriginal: "" };
    mocks.list.mockResolvedValue({
      items: [task],
      hasMore: false,
      nextCursor: null,
    });
    mocks.retry.mockResolvedValue({ id: retriedTaskId });
    mocks.resume.mockResolvedValue({ id: resumedTaskId });
    const wrapper = mount(TaskPage, {
      global: {
        plugins: [i18n],
        stubs: {
          ProjectPageDataError: true,
          TaskTable: {
            props: [
              "data",
              "hasPrevious",
              "hasMore",
              "loading",
              "status",
              "actionTaskId",
              "actionError",
            ],
            emits: [
              "refresh",
              "update:status",
              "previous",
              "next",
              "detail",
              "cancel",
              "retry",
              "resume",
            ],
            template: `
              <button data-testid="cancel" @click="$emit('cancel', data[0])">cancel</button>
              <button data-testid="retry" @click="$emit('retry', data[0])">retry</button>
              <button data-testid="resume" @click="$emit('resume', data[0])">resume</button>
            `,
          },
        },
      },
    });

    await wrapper.get('[data-testid="cancel"]').trigger("click");
    await flushPromises();
    expect(mocks.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, taskId }),
    );

    await wrapper.get('[data-testid="retry"]').trigger("click");
    await flushPromises();
    expect(mocks.retry).toHaveBeenCalledWith({ projectId, taskId });
    expect(mocks.detail).toHaveBeenCalledWith({
      projectId,
      taskId: retriedTaskId,
    });
    expect(globalThis.location.search).toBe(`?taskId=${retriedTaskId}`);

    await wrapper.get('[data-testid="resume"]').trigger("click");
    await flushPromises();
    expect(mocks.resume).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, taskId }),
    );
    expect(mocks.detail).toHaveBeenCalledWith({
      projectId,
      taskId: resumedTaskId,
    });
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
    expect(wrapper.text()).toContain("进度");
    expect(wrapper.text()).not.toContain("0 / 0");
  });
});
