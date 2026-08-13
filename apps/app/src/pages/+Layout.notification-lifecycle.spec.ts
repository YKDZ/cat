import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ControlledStream = Readonly<{
  finish: () => void;
  index: number;
  signal: AbortSignal;
}>;

const mocks = vi.hoisted(() => ({
  connectWs: vi.fn(),
  list: vi.fn(),
  liveStreams: new Set<number>(),
  logError: vi.fn(),
  markAllRead: vi.fn(),
  markRead: vi.fn(),
  openStream: vi.fn(),
  setStreamSignal: vi.fn(),
  streams: [] as ControlledStream[],
  unreadCount: vi.fn(),
  waitForWsOpen: vi.fn(),
}));

vi.mock("@cat/ui", () => ({
  SidebarProvider: { template: "<div><slot /></div>" },
  Toaster: { template: "<div />" },
}));

vi.mock("vike-vue/usePageContext", () => ({
  usePageContext: () => ({ user: { id: "user-1" } }),
}));

vi.mock("#/rpc/orpc.ts", () => ({
  orpc: {
    notification: {
      list: mocks.list,
      markAllRead: mocks.markAllRead,
      markRead: mocks.markRead,
      unreadCount: mocks.unreadCount,
    },
  },
}));

vi.mock("#/rpc/ws.ts", () => ({
  connectWs: mocks.connectWs,
  setNotificationStreamSignal: mocks.setStreamSignal,
  waitForWsOpen: mocks.waitForWsOpen,
  ws: { notification: { stream: mocks.openStream } },
}));

vi.mock("#/utils/cookie.ts", () => ({
  useCookieBooleanRef: () => ({ value: true }),
}));

vi.mock("#/utils/logger.ts", () => ({
  clientLogger: { child: () => ({ error: mocks.logError }) },
}));

import { useNotificationStore } from "#/stores/notification.ts";

import Layout from "./+Layout.vue";

enableAutoUnmount(afterEach);

const persistedPageEvent = (type: "pagehide" | "pageshow"): Event => {
  const event = new Event(type);
  Object.defineProperty(event, "persisted", { value: true });
  return event;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.streams.length = 0;
  mocks.liveStreams.clear();
  mocks.list.mockResolvedValue([]);
  mocks.unreadCount.mockResolvedValue(0);
  mocks.waitForWsOpen.mockResolvedValue(undefined);
  mocks.openStream.mockImplementation(
    async (
      _input: unknown,
      options: unknown,
    ): Promise<AsyncIterable<unknown>> => {
      if (typeof options !== "object" || options === null)
        throw new Error("Notification stream options were not an object");
      const signal = Reflect.get(options, "signal");
      if (!(signal instanceof AbortSignal))
        throw new Error("Notification stream did not receive an AbortSignal");
      const index = mocks.streams.length;
      let finishRequested = false;
      let finishNext: (() => void) | undefined;
      const finish = (): void => {
        if (finishNext === undefined) {
          finishRequested = true;
          return;
        }
        finishNext();
      };
      const iterable: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]: () => ({
          next: () =>
            new Promise<IteratorResult<unknown>>((resolve) => {
              finishNext = () => {
                mocks.liveStreams.delete(index);
                resolve({ done: true, value: undefined });
              };
              if (finishRequested) finishNext();
            }),
        }),
      };
      mocks.liveStreams.add(index);
      mocks.streams.push({ finish, index, signal });
      return iterable;
    },
  );
});

afterEach(async () => {
  for (const stream of mocks.streams) stream.finish();
  await flushPromises();
});

describe("root notification stream lifecycle", () => {
  it("keeps the restored generation live when the released iterator finishes later", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    mount(Layout, {
      global: { plugins: [pinia] },
      slots: { default: "page" },
    });
    await vi.waitFor(() => expect(mocks.openStream).toHaveBeenCalledOnce());

    window.dispatchEvent(persistedPageEvent("pagehide"));
    window.dispatchEvent(persistedPageEvent("pageshow"));
    await vi.waitFor(() => expect(mocks.openStream).toHaveBeenCalledTimes(2));

    const restored = mocks.streams[1];
    if (restored === undefined) throw new Error("Missing restored stream");
    mocks.streams[0]?.finish();
    await flushPromises();

    const store = useNotificationStore(pinia);
    expect(mocks.liveStreams).toEqual(new Set([restored.index]));
    expect(store.isStreaming).toBe(true);
    expect(mocks.setStreamSignal).toHaveBeenLastCalledWith(restored.signal);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("reports a failure from the active stream generation", async () => {
    const failure = new Error("notification stream unavailable");
    mocks.openStream.mockRejectedValueOnce(failure);
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useNotificationStore(pinia);

    await store.startStreaming();

    expect(mocks.logError).toHaveBeenCalledWith("Notification stream error", {
      error: failure,
    });
    expect(store.isStreaming).toBe(false);
    expect(mocks.setStreamSignal).toHaveBeenLastCalledWith(undefined);
  });
});
