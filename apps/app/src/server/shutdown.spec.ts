import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentRedisHandle,
  mockGetDbHandle,
  mockGetGlobalGraphRuntimeOrNull,
  mockInfo,
  mockError,
} = vi.hoisted(() => ({
  mockGetCurrentRedisHandle: vi.fn(),
  mockGetDbHandle: vi.fn(),
  mockGetGlobalGraphRuntimeOrNull: vi.fn(),
  mockInfo: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("@cat/domain", () => ({
  getCurrentRedisHandle: mockGetCurrentRedisHandle,
  getDbHandle: mockGetDbHandle,
}));

vi.mock("@cat/server-shared", () => ({
  serverLogger: {
    child: () => ({
      info: mockInfo,
      error: mockError,
    }),
  },
}));

vi.mock("@cat/workflow", () => ({
  getGlobalGraphRuntimeOrNull: mockGetGlobalGraphRuntimeOrNull,
}));

import { createShutdownHandler } from "./shutdown.ts";

const swallowProcessExit = (
  _code?: Parameters<typeof process.exit>[0],
): never => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Vitest spies must satisfy process.exit's never-returning signature while remaining a test no-op.
  return undefined as never;
};

describe("createShutdownHandler", () => {
  beforeEach(() => {
    mockGetCurrentRedisHandle.mockReset();
    mockGetDbHandle.mockReset();
    mockGetGlobalGraphRuntimeOrNull.mockReset();
    mockInfo.mockReset();
    mockError.mockReset();
    globalThis.runtimeCleanup = undefined;
    globalThis.recallDerivationWorker = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.runtimeCleanup = undefined;
    globalThis.recallDerivationWorker = undefined;
  });

  it("stops runtime cleanup and does not create a Redis connection on shutdown", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const dbDisconnect = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn();
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(swallowProcessExit);

    mockGetCurrentRedisHandle.mockReturnValue(undefined);
    mockGetDbHandle.mockResolvedValue({ disconnect: dbDisconnect });
    globalThis.runtimeCleanup = { stop };

    const shutdown = createShutdownHandler({ close });
    shutdown();

    await vi.waitFor(() => {
      expect(stop).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(dbDisconnect).toHaveBeenCalledOnce();
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  it("disconnects the current Redis handle when one already exists", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const dbDisconnect = vi.fn().mockResolvedValue(undefined);
    const redisDisconnect = vi.fn();
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(swallowProcessExit);

    mockGetCurrentRedisHandle.mockReturnValue({ disconnect: redisDisconnect });
    mockGetDbHandle.mockResolvedValue({ disconnect: dbDisconnect });

    const shutdown = createShutdownHandler({ close });
    shutdown();

    await vi.waitFor(() => {
      expect(redisDisconnect).toHaveBeenCalledOnce();
      expect(dbDisconnect).toHaveBeenCalledOnce();
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  it("stops recall derivation after closing requests and before the database", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const dbDisconnect = vi.fn().mockResolvedValue(undefined);
    const dispose = vi.fn().mockResolvedValue(undefined);
    const stopWorker = vi.fn().mockResolvedValue(undefined);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(swallowProcessExit);
    mockGetDbHandle.mockResolvedValue({ disconnect: dbDisconnect });
    mockGetGlobalGraphRuntimeOrNull.mockReturnValue({ dispose });
    globalThis.recallDerivationWorker = { stop: stopWorker };

    createShutdownHandler({ close })();

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0));
    expect(close).toHaveBeenCalledBefore(stopWorker);
    expect(stopWorker).toHaveBeenCalledBefore(dispose);
    expect(dispose).toHaveBeenCalledBefore(dbDisconnect);
    expect(globalThis.recallDerivationWorker).toBeUndefined();
  });

  it("awaits an in-flight worker drain before disconnecting the database", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const dbDisconnect = vi.fn().mockResolvedValue(undefined);
    let resolveWorkerStop: (() => void) | undefined;
    const stopWorker = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveWorkerStop = resolve;
        }),
    );
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(swallowProcessExit);
    mockGetDbHandle.mockResolvedValue({ disconnect: dbDisconnect });
    globalThis.recallDerivationWorker = { stop: stopWorker };

    createShutdownHandler({ close })();
    await vi.waitFor(() => expect(stopWorker).toHaveBeenCalledOnce());
    expect(dbDisconnect).not.toHaveBeenCalled();

    resolveWorkerStop?.();

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0));
    expect(dbDisconnect).toHaveBeenCalledOnce();
  });

  it("stops a worker only once when shutdown is signaled twice", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const dbDisconnect = vi.fn().mockResolvedValue(undefined);
    const stopWorker = vi.fn().mockResolvedValue(undefined);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(swallowProcessExit);
    mockGetDbHandle.mockResolvedValue({ disconnect: dbDisconnect });
    globalThis.recallDerivationWorker = { stop: stopWorker };

    const shutdown = createShutdownHandler({ close });
    shutdown();
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0));
    shutdown();

    expect(stopWorker).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenLastCalledWith(1);
  });
});
