import { afterEach, describe, expect, it, vi } from "vitest";

import { startPostgresRuntimeCleanup } from "./runtime-cleanup";

afterEach(() => {
  vi.useRealTimers();
});

describe("startPostgresRuntimeCleanup", () => {
  it("returns null when no store supports cleanupExpired", () => {
    const handle = startPostgresRuntimeCleanup([{}]);

    expect(handle).toBeNull();
  });

  it("runs cleanup on a fixed interval and stops cleanly", async () => {
    vi.useFakeTimers();
    const cleanupExpired = vi.fn().mockResolvedValue(3);

    const handle = startPostgresRuntimeCleanup([{ cleanupExpired }]);

    expect(handle).not.toBeNull();

    await vi.advanceTimersByTimeAsync(600_000);
    expect(cleanupExpired).toHaveBeenCalledWith(500);

    handle?.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(cleanupExpired).toHaveBeenCalledTimes(1);
  });

  it("honors cleanup interval and batch size overrides", async () => {
    vi.useFakeTimers();
    const cleanupExpired = vi.fn().mockResolvedValue(1);

    startPostgresRuntimeCleanup([{ cleanupExpired }], {
      CAT_PG_STORE_CLEANUP_INTERVAL_MS: "25",
      CAT_PG_STORE_CLEANUP_BATCH_SIZE: "7",
    });

    await vi.advanceTimersByTimeAsync(25);
    expect(cleanupExpired).toHaveBeenCalledWith(7);
  });
});
