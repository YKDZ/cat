import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentRedisHandle, mockGetDbHandle, mockInfo, mockError } =
  vi.hoisted(() => ({
    mockGetCurrentRedisHandle: vi.fn(),
    mockGetDbHandle: vi.fn(),
    mockInfo: vi.fn(),
    mockError: vi.fn(),
  }));

vi.mock("@cat/domain", () => ({
  getCurrentRedisHandle: mockGetCurrentRedisHandle,
  getDbHandle: mockGetDbHandle,
}));

vi.mock("@cat/server-shared", () => ({
  serverLogger: {
    withSituation: () => ({
      info: mockInfo,
      error: mockError,
    }),
  },
}));

import { createShutdownHandler } from "./shutdown";

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
    mockInfo.mockReset();
    mockError.mockReset();
    globalThis.runtimeCleanup = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.runtimeCleanup = undefined;
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
});
