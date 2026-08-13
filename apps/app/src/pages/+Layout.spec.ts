import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExpectedRequestCancellationError } from "#/rpc/request-cancellation.ts";

const mocks = vi.hoisted(() => ({
  connectWs: vi.fn(),
  loadInitial: vi.fn(),
  logError: vi.fn(),
  startStreaming: vi.fn(),
  stopStreaming: vi.fn(),
}));

vi.mock("@cat/ui", () => ({
  SidebarProvider: { template: "<div><slot /></div>" },
  Toaster: { template: "<div />" },
}));

vi.mock("vike-vue/usePageContext", () => ({
  usePageContext: () => ({ user: { id: "user-1" } }),
}));

vi.mock("#/rpc/ws.ts", () => ({ connectWs: mocks.connectWs }));

vi.mock("#/stores/notification.ts", () => ({
  useNotificationStore: () => ({
    loadInitial: mocks.loadInitial,
    startStreaming: mocks.startStreaming,
    stopStreaming: mocks.stopStreaming,
  }),
}));

vi.mock("#/utils/cookie.ts", () => ({
  useCookieBooleanRef: () => ({ value: true }),
}));

vi.mock("#/utils/logger.ts", () => ({
  clientLogger: { child: () => ({ error: mocks.logError }) },
}));

import Layout from "./+Layout.vue";

enableAutoUnmount(afterEach);

describe("root layout request lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadInitial.mockReset();
  });

  it("ends an expected navigation cancellation without a Vue lifecycle error", async () => {
    mocks.loadInitial.mockRejectedValue(
      new ExpectedRequestCancellationError({
        expected: true,
        id: "notification-request",
        kind: "navigation",
        time: Date.now(),
        url: "http://cat.test/api/rpc/notification/list",
        version: 1,
      }),
    );
    const lifecycleErrors: unknown[] = [];

    mount(Layout, {
      global: {
        config: {
          errorHandler: (error) => lifecycleErrors.push(error),
        },
      },
      slots: { default: "page" },
    });
    await flushPromises();

    expect(lifecycleErrors).toEqual([]);
    expect(mocks.startStreaming).not.toHaveBeenCalled();
  });

  it("keeps a real notification initialization failure observable", async () => {
    const failure = new Error("notification server unavailable");
    mocks.loadInitial.mockRejectedValue(failure);
    const lifecycleErrors: unknown[] = [];

    mount(Layout, {
      global: {
        config: {
          errorHandler: (error) => lifecycleErrors.push(error),
        },
      },
      slots: { default: "page" },
    });
    await flushPromises();

    expect(lifecycleErrors).toEqual([failure]);
    expect(mocks.startStreaming).not.toHaveBeenCalled();
  });

  it("restarts notification initialization after a BFCache restore", async () => {
    mocks.loadInitial
      .mockRejectedValueOnce(
        new ExpectedRequestCancellationError({
          expected: true,
          id: "notification-request",
          kind: "navigation",
          time: Date.now(),
          url: "http://cat.test/api/rpc/notification/list",
          version: 1,
        }),
      )
      .mockResolvedValueOnce(undefined);
    const lifecycleErrors: unknown[] = [];
    mount(Layout, {
      global: {
        config: {
          errorHandler: (error) => lifecycleErrors.push(error),
        },
      },
      slots: { default: "page" },
    });
    await flushPromises();

    const pageHide = new Event("pagehide");
    Object.defineProperty(pageHide, "persisted", { value: true });
    window.dispatchEvent(pageHide);
    const pageShow = new Event("pageshow");
    Object.defineProperty(pageShow, "persisted", { value: true });
    window.dispatchEvent(pageShow);
    await flushPromises();

    expect(lifecycleErrors).toEqual([]);
    expect(mocks.loadInitial).toHaveBeenCalledTimes(2);
    expect(mocks.startStreaming).toHaveBeenCalledOnce();
    expect(mocks.stopStreaming).toHaveBeenCalledOnce();
  });

  it("reports a real notification failure after a BFCache restore", async () => {
    const failure = new Error("notification server unavailable after restore");
    mocks.loadInitial
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(failure);
    mount(Layout, { slots: { default: "page" } });
    await flushPromises();

    const pageShow = new Event("pageshow");
    Object.defineProperty(pageShow, "persisted", { value: true });
    window.dispatchEvent(pageShow);
    await flushPromises();

    expect(mocks.logError).toHaveBeenCalledWith(
      "Failed to initialize notifications after BFCache restore",
      { error: failure },
    );
  });
});
