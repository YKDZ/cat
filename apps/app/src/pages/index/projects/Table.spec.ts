import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logError: vi.fn(),
  navigate: vi.fn(),
  request: vi.fn(),
}));

vi.mock("vike-vue/usePageContext", () => ({
  usePageContext: () => ({ user: { id: "user-1" } }),
}));
vi.mock("vike/client/router", () => ({ navigate: mocks.navigate }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("#/utils/logger.ts", () => ({
  clientLogger: { child: () => ({ error: mocks.logError }) },
}));
vi.mock("./Table.telefunc.ts", () => ({ onRequestProjects: mocks.request }));

import ProjectTable from "./Table.vue";

enableAutoUnmount(afterEach);

describe("Project table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.request.mockReset();
  });

  it("keeps project fetching and navigation outside the controlled DataTable", async () => {
    mocks.request.mockResolvedValue({
      data: [
        {
          createdAt: "2026-08-01T00:00:00.000Z",
          description: null,
          id: "project-1",
          name: "Project one",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      total: 21,
    });
    const wrapper = mount(ProjectTable);
    await flushPromises();

    expect(mocks.request).toHaveBeenCalledWith(0, 10);
    await wrapper.get('select[aria-label="每页条数"]').setValue("20");
    await flushPromises();
    expect(mocks.request).toHaveBeenLastCalledWith(0, 20);

    await wrapper
      .get('input[aria-label="搜索名称或描述"]')
      .setValue("Project one");
    await vi.waitFor(() =>
      expect(mocks.request).toHaveBeenLastCalledWith(0, 20, "Project one"),
    );

    await wrapper.get('button[aria-label="名称"]').trigger("click");
    await vi.waitFor(() =>
      expect(mocks.request).toHaveBeenLastCalledWith(0, 20, "Project one", {
        desc: false,
        id: "name",
      }),
    );

    await wrapper.get('input[aria-label="搜索名称或描述"]').setValue("");
    await vi.waitFor(() =>
      expect(mocks.request).toHaveBeenLastCalledWith(0, 20, null, {
        desc: false,
        id: "name",
      }),
    );

    await wrapper.get('button[aria-label="名称"]').trigger("click");
    await vi.waitFor(() =>
      expect(mocks.request).toHaveBeenLastCalledWith(0, 20, null, {
        desc: true,
        id: "name",
      }),
    );

    await wrapper
      .get('tr[data-row-id="project-1"] button[data-row-action]')
      .trigger("click");
    expect(mocks.navigate).toHaveBeenCalledWith("/project/project-1");
  });

  it("does not report a request failure after navigation releases the page", async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    mocks.request.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    mount(ProjectTable);
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());

    window.dispatchEvent(new Event("pagehide"));
    rejectRequest?.(new Error("No Server Connection"));
    await flushPromises();

    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("reports the same request failure while the page still owns the request", async () => {
    const failure = new Error("No Server Connection");
    mocks.request.mockRejectedValue(failure);

    mount(ProjectTable);
    await flushPromises();

    expect(mocks.logError).toHaveBeenCalledWith("Failed to fetch projects", {
      error: failure,
    });
  });

  it("keeps the latest page when an older request resolves afterwards", async () => {
    type Result = {
      data: Array<{
        createdAt: string;
        description: null;
        id: string;
        name: string;
        updatedAt: string;
      }>;
      total: number;
    };
    const pending: Array<(result: Result) => void> = [];
    mocks.request.mockImplementation(
      () =>
        new Promise<Result>((resolve) => {
          pending.push(resolve);
        }),
    );
    const wrapper = mount(ProjectTable);
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());

    await wrapper.get('select[aria-label="每页条数"]').setValue("20");
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    pending[1]?.({
      data: [
        {
          createdAt: "2026-08-02T00:00:00.000Z",
          description: null,
          id: "latest-project",
          name: "Latest project",
          updatedAt: "2026-08-02T00:00:00.000Z",
        },
      ],
      total: 1,
    });
    await flushPromises();
    expect(wrapper.find('tr[data-row-id="latest-project"]').exists()).toBe(
      true,
    );

    pending[0]?.({
      data: [
        {
          createdAt: "2026-08-01T00:00:00.000Z",
          description: null,
          id: "stale-project",
          name: "Stale project",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      total: 1,
    });
    await flushPromises();

    expect(wrapper.find('tr[data-row-id="stale-project"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('tr[data-row-id="latest-project"]').exists()).toBe(
      true,
    );
  });

  it("refetches after BFCache restores a released page", async () => {
    type Result = {
      data: Array<{
        createdAt: string;
        description: null;
        id: string;
        name: string;
        updatedAt: string;
      }>;
      total: number;
    };
    const pending: Array<{
      reject: (error: Error) => void;
      resolve: (result: Result) => void;
    }> = [];
    mocks.request.mockImplementation(
      () =>
        new Promise<Result>((resolve, reject) => {
          pending.push({ reject, resolve });
        }),
    );
    const wrapper = mount(ProjectTable);
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());

    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pageshow"));
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    pending[0]?.reject(new Error("No Server Connection"));
    pending[1]?.resolve({
      data: [
        {
          createdAt: "2026-08-03T00:00:00.000Z",
          description: null,
          id: "restored-project",
          name: "Restored project",
          updatedAt: "2026-08-03T00:00:00.000Z",
        },
      ],
      total: 1,
    });
    await flushPromises();

    expect(mocks.logError).not.toHaveBeenCalled();
    expect(wrapper.find('tr[data-row-id="restored-project"]').exists()).toBe(
      true,
    );
    expect(wrapper.get("[data-data-table]").attributes("aria-busy")).toBe(
      "false",
    );
  });
});
