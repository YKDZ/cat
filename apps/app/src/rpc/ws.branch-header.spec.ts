import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpcLinkOptions: null as {
    headers: () => Record<string, string>;
    interceptors: Array<(error: unknown) => void>;
  } | null,
  socketOptions: null as { startClosed?: boolean } | null,
  createORPCClient: vi.fn((link) => link),
  loggerError: vi.fn(),
  reconnect: vi.fn(),
  socket: null as {
    emit: (type: "open") => void;
    readyState: number;
  } | null,
}));

vi.mock("#/stores/branch.ts", async () => {
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
    static CONNECTING = 0;
    static OPEN = 1;
    readyState = 3;
    private readonly listeners = new Map<string, Set<() => void>>();

    constructor(
      _url: string,
      _protocols: unknown,
      options: { startClosed?: boolean },
    ) {
      mocks.socketOptions = options;
      mocks.socket = this;
    }

    addEventListener(type: string, listener: () => void) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: () => void) {
      this.listeners.get(type)?.delete(listener);
    }

    emit(type: "open") {
      if (type === "open") this.readyState = 1;
      for (const listener of this.listeners.get(type) ?? []) listener();
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

vi.mock("#/utils/logger.ts", () => ({
  clientLogger: {
    child: () => ({ error: mocks.loggerError }),
  },
}));

vi.mock("@orpc/client/websocket", () => ({
  RPCLink: function RPCLink(options: {
    headers: () => Record<string, string>;
    interceptors: Array<(error: unknown) => void>;
  }) {
    mocks.rpcLinkOptions = options;
    return { options };
  },
}));

describe("ws branch header isolation", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.rpcLinkOptions = null;
    mocks.socketOptions = null;
    mocks.socket = null;
    mocks.createORPCClient.mockClear();
    mocks.loggerError.mockClear();
    mocks.reconnect.mockClear();
  });

  it("does not attach global branch headers to websocket RPC requests", async () => {
    const module = await import("./ws.ts");

    const headers = mocks.rpcLinkOptions?.headers() ?? {};

    expect(headers).toEqual({});
    expect(headers).not.toHaveProperty("x-branch-id");
    expect(headers).not.toHaveProperty("x-branch-project-id");

    expect(mocks.socketOptions).toEqual({ startClosed: true });

    module.connectWs();
    expect(mocks.reconnect).toHaveBeenCalledOnce();
  });

  it("suppresses websocket errors only for an explicitly aborted notification stream", async () => {
    const module = await import("./ws.ts");
    const onError = mocks.rpcLinkOptions?.interceptors[0];
    if (onError === undefined)
      throw new Error("WebSocket error interceptor missing");
    const controller = new AbortController();

    module.setNotificationStreamSignal(controller.signal);
    onError(new Error("active notification stream failed"));
    expect(mocks.loggerError).toHaveBeenCalledOnce();

    controller.abort();
    onError(new Error("aborted notification stream closed"));
    expect(mocks.loggerError).toHaveBeenCalledOnce();

    module.setNotificationStreamSignal(undefined);
    onError(new Error("unrelated websocket failure"));
    expect(mocks.loggerError).toHaveBeenCalledTimes(2);

    const queueAbort = new DOMException(
      "[AsyncIdQueue] Queue[1] was closed or aborted while waiting for pulling.",
      "AbortError",
    );
    onError(queueAbort);
    expect(mocks.loggerError).toHaveBeenCalledTimes(2);
  });

  it("waits for the authenticated socket upgrade before a stream can send", async () => {
    const module = await import("./ws.ts");
    const controller = new AbortController();

    const waiting = module.waitForWsOpen(controller.signal);
    expect(mocks.reconnect).toHaveBeenCalledOnce();

    mocks.socket?.emit("open");
    await expect(waiting).resolves.toBeUndefined();
  });
});
