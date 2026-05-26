import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpcLinkOptions: null as {
    headers: () => Record<string, string>;
  } | null,
  createORPCClient: vi.fn((link) => link),
}));

vi.mock("@/stores/branch", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");

  return {
    useBranchStore: defineStore("orpcBranchHeaderSpec", () => ({
      currentBranchId: ref(7),
      currentProjectId: ref("11111111-1111-4111-8111-111111111111"),
    })),
  };
});

vi.mock("@orpc/client", () => ({
  createORPCClient: mocks.createORPCClient,
  onError: (handler: unknown) => handler,
}));

vi.mock("@orpc/client/fetch", () => ({
  RPCLink: function RPCLink(options: {
    headers: () => Record<string, string>;
  }) {
    mocks.rpcLinkOptions = options;
    return { options };
  },
}));

describe("orpc branch header isolation", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.rpcLinkOptions = null;
    mocks.createORPCClient.mockClear();
    document.cookie = "csrfToken=test-csrf-token";
  });

  it("does not send global branch headers from the app client", async () => {
    await import("./orpc.ts");

    const headers = mocks.rpcLinkOptions?.headers() ?? {};

    expect(headers).toEqual({
      "x-csrf-token": "test-csrf-token",
    });
    expect(headers).not.toHaveProperty("x-branch-id");
    expect(headers).not.toHaveProperty("x-branch-project-id");
  });
});
