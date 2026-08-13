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

type TaskRow = {
  id: string;
  task: TaskKind;
  state: TaskState;
  createdAt: Date | string;
  updatedAt: Date | string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
};

const task: TaskRow = {
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
        stubs: { ProjectPageDataError: true },
      },
    });

    await flushPromises();

    expect(mocks.detail).not.toHaveBeenCalled();
    const detail = wrapper.get('[aria-label="任务详情"]').text();
    expect(detail).toContain(taskId);
    expect(detail).toContain("总量待定");
  });

  it("provides the required empty sorting contract without exposing sortable columns", async () => {
    const warnings: string[] = [];
    const wrapper = mount(TaskPage, {
      global: {
        config: {
          warnHandler: (message) => warnings.push(message),
        },
        plugins: [i18n],
        stubs: { ProjectPageDataError: true },
      },
    });
    await flushPromises();

    expect(warnings).not.toContain('Missing required prop: "sorting"');
    expect(wrapper.findAll('thead button[aria-label="任务"]')).toHaveLength(0);
    expect(wrapper.findAll('thead button[aria-label="状态"]')).toHaveLength(0);
  });

  it("renders an internal operation failure through its redacted projection", async () => {
    mocks.pageContext.urlParsed = { searchOriginal: `?taskId=${taskId}` };
    mocks.useData.mockReturnValue({
      pageError: null,
      projectId,
      tasks: { items: [task], hasMore: false, nextCursor: null },
      selectedDetail: {
        task,
        currentFailure: {
          blocker: "recall_derivation_failed",
          code: "CAT_OPERATION_FAILED",
          id: "44444444-4444-4444-8444-444444444444",
          redacted: true,
          redactionBoundary: "INTERNAL",
          retryable: false,
          severity: "ERROR",
        },
      },
      detailAvailability: null,
    });

    const wrapper = mount(TaskPage, {
      global: { plugins: [i18n], stubs: { ProjectPageDataError: true } },
    });
    await flushPromises();

    const detail = wrapper.get('[aria-label="任务详情"]').text();
    expect(detail).toContain("失败详情已隐藏");
    expect(detail).not.toContain("undefined");
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
        },
      },
    });

    await wrapper.get('[title="下一页"]').trigger("click");
    await flushPromises();
    expect(mocks.list).toHaveBeenLastCalledWith({
      projectId,
      pageSize: 20,
      cursor: nextCursor,
    });

    await wrapper.get('[title="上一页"]').trigger("click");
    await flushPromises();
    expect(mocks.list).toHaveBeenLastCalledWith({ projectId, pageSize: 20 });

    await wrapper.get('[title="下一页"]').trigger("click");
    await flushPromises();
    await wrapper.get('select[aria-label="状态"]').setValue("FAILED");
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
          items: TaskRow[];
          hasMore: boolean;
          nextCursor: null;
        }) => void)
      | undefined;
    let resolveFiltered:
      | ((value: {
          items: TaskRow[];
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
        },
      },
    });

    await wrapper.get('[data-testid="refresh"]').trigger("click");
    await wrapper.get('select[aria-label="状态"]').setValue("FAILED");
    expect(wrapper.get("[data-data-table]").attributes("aria-busy")).toBe(
      "true",
    );

    resolveFiltered?.({
      items: [filteredTask],
      hasMore: false,
      nextCursor: null,
    });
    await flushPromises();
    expect(wrapper.get("[data-data-table]").attributes("aria-busy")).toBe(
      "false",
    );
    expect(wrapper.text()).toContain("失败");

    resolveRefresh?.({ items: [task], hasMore: false, nextCursor: null });
    await flushPromises();
    expect(wrapper.text()).toContain("失败");
  });

  it("rolls back a failed filter without leaving filtered rows or state committed", async () => {
    mocks.list.mockRejectedValueOnce(new Error("offline"));
    const wrapper = mount(TaskPage, {
      global: {
        plugins: [i18n],
        stubs: {
          ProjectPageDataError: true,
        },
      },
    });

    await wrapper.get('select[aria-label="状态"]').setValue("FAILED");
    await flushPromises();

    expect(
      (wrapper.get('select[aria-label="状态"]').element as HTMLSelectElement)
        .value,
    ).toBe("");
    expect(wrapper.text()).toContain("等待中");
    expect(wrapper.text()).toContain("任务列表暂时无法加载，请重试");
  });

  it("restores the last successful list when an earlier filter resolves after a later filter fails", async () => {
    let resolvePending:
      | ((value: {
          items: TaskRow[];
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
        },
      },
    });

    await wrapper.get('select[aria-label="状态"]').setValue("PENDING");
    await wrapper.get('select[aria-label="状态"]').setValue("FAILED");
    await flushPromises();
    resolvePending?.({ items: [task], hasMore: false, nextCursor: null });
    await flushPromises();

    expect(
      (wrapper.get('select[aria-label="状态"]').element as HTMLSelectElement)
        .value,
    ).toBe("");
    expect(wrapper.text()).toContain("等待中");
    expect(wrapper.text()).toContain("任务列表暂时无法加载，请重试");
  });

  it("clears old detail during popstate and commits only the newest requested task", async () => {
    const otherTaskId = "88888888-8888-4888-8888-888888888888";
    const otherTask = { ...task, id: otherTaskId };
    let resolveDetail:
      | ((value: { task: TaskRow; currentFailure: null }) => void)
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
        stubs: { ProjectPageDataError: true },
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
        },
      },
    });

    await wrapper.get('[data-testid="cancel"]').trigger("click");

    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(wrapper.get("[data-data-table]").attributes("aria-busy")).toBe(
      "true",
    );
    expect(wrapper.find('[data-testid="cancel"]').exists()).toBe(false);

    resolveCancel?.();
    await flushPromises();
    expect(wrapper.get("[data-data-table]").attributes("aria-busy")).toBe(
      "false",
    );
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
    const cancelWrapper = mount(TaskPage, {
      global: {
        plugins: [i18n],
        stubs: { ProjectPageDataError: true },
      },
    });

    await cancelWrapper.get('[data-testid="cancel"]').trigger("click");
    await flushPromises();
    expect(mocks.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, taskId }),
    );

    mocks.useData.mockReturnValue({
      pageError: null,
      projectId,
      tasks: {
        items: [
          { ...task, state: { ...task.state, status: "FAILED" as const } },
        ],
        hasMore: false,
        nextCursor: null,
        total: 1,
      },
    });
    const retryWrapper = mount(TaskPage, {
      global: { plugins: [i18n], stubs: { ProjectPageDataError: true } },
    });
    await retryWrapper.get('[data-testid="retry"]').trigger("click");
    await flushPromises();
    expect(mocks.retry).toHaveBeenCalledWith({ projectId, taskId });
    expect(mocks.detail).toHaveBeenCalledWith({
      projectId,
      taskId: retriedTaskId,
    });
    expect(globalThis.location.search).toBe(`?taskId=${retriedTaskId}`);

    mocks.useData.mockReturnValue({
      pageError: null,
      projectId,
      tasks: {
        items: [
          { ...task, state: { ...task.state, status: "BLOCKED" as const } },
        ],
        hasMore: false,
        nextCursor: null,
        total: 1,
      },
    });
    const resumeWrapper = mount(TaskPage, {
      global: { plugins: [i18n], stubs: { ProjectPageDataError: true } },
    });
    await resumeWrapper.get('[data-testid="resume"]').trigger("click");
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
        },
      },
    });

    await wrapper
      .get(`tr[data-row-id="${taskId}"] button[data-row-action]`)
      .trigger("click");
    await flushPromises();

    expect(mocks.detail).toHaveBeenCalledWith({ projectId, taskId });
    expect(wrapper.text()).toContain("调用参数");
    expect(wrapper.text()).toContain("最低相似度");
    expect(wrapper.text()).not.toContain("分支");
    expect(wrapper.text()).toContain("进度");
    expect(wrapper.text()).not.toContain("0 / 0");
  });
});
