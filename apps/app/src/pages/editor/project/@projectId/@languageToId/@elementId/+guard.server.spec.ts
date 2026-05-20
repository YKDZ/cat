import type { PageContextServer } from "vike/types";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFirstElement: vi.fn(),
  redirect: vi.fn((location: string) => ({ type: "redirect", location })),
  render: vi.fn((location: string, reason?: string) => ({
    type: "render",
    location,
    reason,
  })),
}));

vi.mock("@/server/ssc", () => ({
  ssc: vi.fn(() => ({
    editor: {
      getFirstElement: mocks.getFirstElement,
    },
  })),
}));

vi.mock("vike/abort", () => ({
  redirect: mocks.redirect,
  render: mocks.render,
}));

import { guard } from "./+guard.server";

const projectId = "11111111-1111-4111-8111-111111111111";
const nodeId = "22222222-2222-4222-8222-222222222222";

const createCtx = (searchOriginal = ""): PageContextServer =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal Vike guard context stub for unit tests
  ({
    user: { id: "user-1" },
    routeParams: {
      projectId,
      languageToId: "zh-Hans",
      elementId: "auto",
    },
    urlParsed: {
      searchOriginal,
    },
  }) as unknown as PageContextServer;

describe("project editor auto guard", () => {
  beforeEach(() => {
    mocks.getFirstElement.mockReset();
    mocks.redirect.mockClear();
    mocks.render.mockClear();
  });

  it("queries the first element with normalized scope", async () => {
    mocks.getFirstElement.mockResolvedValueOnce({ id: 123 });

    await expect(
      guard(
        createCtx(
          `?nodes=${nodeId}&q=foo&status=translated&branchId=1&page=3&pageSize=20`,
        ),
      ),
    ).rejects.toEqual({
      type: "redirect",
      location: `/editor/project/${projectId}/zh-Hans/123?nodes=${nodeId}&q=foo&status=translated&page=3&pageSize=20&branchId=1`,
    });

    expect(mocks.getFirstElement).toHaveBeenCalledWith({
      projectId,
      languageToId: "zh-Hans",
      branchId: 1,
      contentNodeIds: [nodeId],
      searchQuery: "foo",
      statusFilter: "translated",
      sortMode: "structure",
      page: 3,
      pageSize: 20,
    });
  });

  it("sanitizes invalid query values before querying", async () => {
    mocks.getFirstElement.mockResolvedValueOnce({ id: 456 });

    await expect(
      guard(createCtx(`?status=bad&nodes=bad&page=-1&pageSize=9999`)),
    ).rejects.toEqual({
      type: "redirect",
      location: `/editor/project/${projectId}/zh-Hans/456`,
    });

    expect(mocks.getFirstElement).toHaveBeenCalledWith({
      projectId,
      languageToId: "zh-Hans",
      branchId: undefined,
      contentNodeIds: [],
      searchQuery: "",
      statusFilter: "all",
      sortMode: "structure",
      page: 1,
      pageSize: 16,
    });
  });

  it("redirects to empty while preserving sanitized scope", async () => {
    mocks.getFirstElement.mockResolvedValueOnce(null);

    await expect(
      guard(createCtx(`?nodes=${nodeId}&q=foo&status=translated&branchId=7`)),
    ).rejects.toEqual({
      type: "redirect",
      location: `/editor/project/${projectId}/zh-Hans/empty?nodes=${nodeId}&q=foo&status=translated&branchId=7`,
    });
  });
});
