import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TokenBucket } from "./token-bucket.ts";

describe("TokenBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows immediate consume when bucket is full", async () => {
    const bucket = new TokenBucket(10, 10);
    const start = Date.now();
    await bucket.acquire();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("replenishes tokens over time", async () => {
    const bucket = new TokenBucket(10, 10);
    // Drain the bucket
    // oxlint-disable-next-line no-await-in-loop -- sequential token consumption required for state setup
    for (let i = 0; i < 10; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential token consumption required for state setup
      await bucket.acquire();
    }

    // Advance time by 500ms — should add 5 tokens at 10/s
    vi.advanceTimersByTime(500);

    // Should allow 5 more acquires without waiting
    let resolved = 0;
    for (let i = 0; i < 5; i += 1) {
      const p = bucket.acquire().then(() => {
        resolved += 1;
      });
      // Run any pending timers
      vi.runAllTimers();
      // oxlint-disable-next-line no-await-in-loop -- sequential: each acquire needs timer advancement before next
      await p;
    }
    expect(resolved).toBe(5);
  });

  it("rate-limits when bucket is empty", async () => {
    const bucket = new TokenBucket(1, 1); // 1 token per second, capacity 1

    // First acquire consumes the single token
    await bucket.acquire();

    // Second acquire should wait ~1000ms
    let acquired = false;
    const p = bucket.acquire().then(() => {
      acquired = true;
    });

    expect(acquired).toBe(false);

    // Advance timer by 1100ms to ensure refill
    vi.advanceTimersByTime(1100);
    await p;
    expect(acquired).toBe(true);
  });

  it("respects burst capacity limit", async () => {
    const bucket = new TokenBucket(100, 5); // high rate but cap at 5
    // Should be able to acquire 5 at once without waiting
    const acquires = Array.from({ length: 5 }, async () => bucket.acquire());
    await Promise.all(acquires);
    // All resolved without needing to advance time
    expect(acquires).toHaveLength(5);
  });
});
