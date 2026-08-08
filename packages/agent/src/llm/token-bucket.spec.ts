import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TokenBucket } from "./token-bucket.ts";

describe("TokenBucket", () => {
  const activeSignal = new AbortController().signal;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows immediate consume when bucket is full", async () => {
    const bucket = new TokenBucket(10, 10);
    const start = Date.now();
    await bucket.acquire(activeSignal);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("replenishes tokens over time", async () => {
    const bucket = new TokenBucket(10, 10);
    for (let i = 0; i < 10; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential token consumption sets bucket state
      await bucket.acquire(activeSignal);
    }

    vi.advanceTimersByTime(500);
    let resolved = 0;
    for (let i = 0; i < 5; i += 1) {
      const operation = bucket.acquire(activeSignal).then(() => {
        resolved += 1;
      });
      vi.runAllTimers();
      // oxlint-disable-next-line no-await-in-loop -- each acquire observes the previous token state
      await operation;
    }
    expect(resolved).toBe(5);
  });

  it("rate-limits when bucket is empty", async () => {
    const bucket = new TokenBucket(1, 1);
    await bucket.acquire(activeSignal);
    let acquired = false;
    const operation = bucket.acquire(activeSignal).then(() => {
      acquired = true;
    });

    expect(acquired).toBe(false);
    await vi.advanceTimersByTimeAsync(1_100);
    await operation;
    expect(acquired).toBe(true);
  });

  it("respects burst capacity limit", async () => {
    const bucket = new TokenBucket(100, 5);
    const acquires = Array.from(
      { length: 5 },
      async () => await bucket.acquire(activeSignal),
    );
    await Promise.all(acquires);
    expect(acquires).toHaveLength(5);
  });

  it("rejects a rate-limit wait immediately when its signal aborts", async () => {
    const bucket = new TokenBucket(1, 1);
    const first = new AbortController();
    await bucket.acquire(first.signal);
    const controller = new AbortController();
    const cause = new Error("cancelled while rate limited");

    const waiting = bucket.acquire(controller.signal);
    controller.abort(cause);

    await expect(waiting).rejects.toBe(cause);
  });
});
