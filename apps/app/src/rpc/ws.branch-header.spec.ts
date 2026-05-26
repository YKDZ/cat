import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpcLinkOptions: null as {
    headers: () => Record<string, string>;
  } | null,
  createORPCClient: vi.fn((link) => link),
  reconnect: vi.fn(),
}));

vi.mock("@/stores/branch", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");

  return {
    useBranchStore: defineStore("wsBranchHeaderSpec", () => ({
      currentBranchId: ref(7),
      currentProjectId: ref("11111111-1111-4111-8111-111111111111"),
    })),
  };
});

vi.mock("partysocket", () => ({
  WebSocket: class MockWebSocket {
    readyState = 1;

    addEventListener() {
      return undefined;
    }

    send() {
      return undefined;
    }

    reconnect() {
      mocks.reconnect();
    }
  },
}));

vi.mock("@orpc/client", () => ({
  createORPCClient: mocks.createORPCClient,
  onError: (handler: unknown) => handler,
}));

vi.mock("@orpc/client/websocket", () => ({
  RPCLink: function RPCLink(options: {
    headers: () => Record<string, string>;
  }) {
    mocks.rpcLinkOptions = options;
    return { options };
  },
}));

describe("ws branch header isolation", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.rpcLinkOptions = null;
    mocks.createORPCClient.mockClear();
    mocks.reconnect.mockClear();
  });

  it("does not attach global branch headers to websocket RPC requests", async () => {
    const module = await import("./ws.ts");

    const headers = mocks.rpcLinkOptions?.headers() ?? {};

    expect(headers).toEqual({});
    expect(headers).not.toHaveProperty("x-branch-id");
    expect(headers).not.toHaveProperty("x-branch-project-id");

    module.reconnectWs();
    expect(mocks.reconnect).toHaveBeenCalledOnce();
  });
});
