import type { PageContextServer } from "vike/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  list: vi.fn(),
  ssc: vi.fn(),
}));

vi.mock("#/server/ssc.ts", () => ({
  ssc: mocks.ssc,
}));

vi.mock("../project-shell.server.ts", () => ({
  withProjectShell: async <Result>(
    _ctx: PageContextServer,
    callback: () => Promise<Result>,
  ): Promise<Result> => await callback(),
}));

import { data } from "./+data.ts";

const projectId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const tasks = { items: [], hasMore: false, nextCursor: null };
const selectedDetail = { task: { id: taskId }, currentFailure: null };

const createContext = (searchOriginal = ""): PageContextServer =>
  ({
    routeParams: { projectId },
    urlParsed: { searchOriginal },
  }) as unknown as PageContextServer;

describe("task page SSR data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ssc.mockReturnValue({
      task: { list: mocks.list, detail: mocks.detail },
    });
    mocks.list.mockResolvedValue(tasks);
    mocks.detail.mockResolvedValue(selectedDetail);
  });

  it("loads only the authorized list when no detail is requested", async () => {
    await expect(data(createContext())).resolves.toMatchObject({
      projectId,
      tasks,
      selectedDetail: undefined,
      detailAvailability: null,
    });
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("keeps the list and reports an invalid task link without querying detail", async () => {
    await expect(
      data(createContext("?taskId=not-a-uuid")),
    ).resolves.toMatchObject({
      tasks,
      selectedDetail: undefined,
      detailAvailability: "invalid",
    });
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("serializes an authorized detail into the initial page data", async () => {
    await expect(
      data(createContext(`?taskId=${taskId}`)),
    ).resolves.toMatchObject({
      tasks,
      selectedDetail,
      detailAvailability: null,
    });
    expect(mocks.detail).toHaveBeenCalledWith({ projectId, taskId });
  });

  it("uses one public unavailable detail state without exposing the RPC error", async () => {
    mocks.detail.mockRejectedValueOnce(new Error("forbidden task details"));

    await expect(
      data(createContext(`?taskId=${taskId}`)),
    ).resolves.toMatchObject({
      tasks,
      selectedDetail: undefined,
      detailAvailability: "unavailable",
    });
  });
});
