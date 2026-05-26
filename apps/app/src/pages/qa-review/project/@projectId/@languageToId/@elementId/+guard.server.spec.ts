import type { PageContextServer } from "vike/types";

import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFirstReviewableElement: vi.fn(),
  redirect: vi.fn((location: string) => ({
    type: "redirect",
    location,
  })),
  render: vi.fn((location: string, reason?: string) => ({
    type: "render",
    location,
    reason,
  })),
}));

vi.mock("@/server/ssc", () => ({
  ssc: () => ({
    qaReview: {
      getFirstReviewableElement: mocks.getFirstReviewableElement,
    },
  }),
}));

vi.mock("vike/abort", () => ({
  redirect: mocks.redirect,
  render: mocks.render,
}));

import { guard } from "./+guard.server";

const createCtx = (): PageContextServer =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal Vike guard context stub for unit tests
  ({
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "qa-guard@test.local",
      name: "QA Guard Tester",
      emailVerified: true,
      avatarFileId: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    },
    routeParams: {
      projectId: "11111111-1111-4111-8111-111111111111",
      languageToId: "zh-Hans",
      elementId: "auto",
    },
    urlParsed: { searchOriginal: "" },
  }) as unknown as PageContextServer;

describe("qa review guard", () => {
  it("renders auth page when user is not logged in", async () => {
    const ctx = createCtx();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal guard context override for unauth case
    const unauthCtx = { ...ctx, user: null } as unknown as PageContextServer;

    await expect(guard(unauthCtx)).rejects.toMatchObject({
      type: "render",
      location: "/auth",
    });
  });

  it("redirects auto target to first reviewable element", async () => {
    mocks.getFirstReviewableElement.mockResolvedValueOnce({ elementId: 42 });

    await expect(guard(createCtx())).rejects.toMatchObject({
      type: "redirect",
      location:
        "/qa-review/project/11111111-1111-4111-8111-111111111111/zh-Hans/42",
    });

    expect(mocks.getFirstReviewableElement).toHaveBeenCalledWith({
      projectId: "11111111-1111-4111-8111-111111111111",
      languageToId: "zh-Hans",
      contentNodeIds: [],
      searchQuery: "",
      statusFilter: "all",
      sortMode: "structure",
      page: 1,
      pageSize: 16,
      queueFilters: {
        queueStatus: [],
        riskBucket: [],
        findingAction: [],
        includeResolved: false,
      },
    });
  });
});
