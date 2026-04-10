import { describe, expect, it } from "vitest";

import type { LLMPriority } from "./priority-queue.ts";

import { PriorityQueue } from "./priority-queue.ts";

describe("PriorityQueue", () => {
  it("processes items by priority order (CRITICAL > HIGH > NORMAL > LOW)", async () => {
    const queue = new PriorityQueue<string>(1);
    const order: string[] = [];

    // Enqueue concurrency=1, so the first item runs immediately
    // We enqueue all and track dequeue order via the resolve callback

    // Intentionally enqueue in reverse priority order; the queue should reorder
    const items: Array<{ value: string; priority: LLMPriority }> = [
      { value: "low", priority: "LOW" },
      { value: "normal", priority: "NORMAL" },
      { value: "high", priority: "HIGH" },
      { value: "critical", priority: "CRITICAL" },
    ];

    // With concurrency=1, the first enqueue resolves immediately (running slot)
    // Subsequent items wait. We'll track resolution order.
    const allPromises = items.map(async ({ value, priority }) =>
      queue.enqueue(value, priority).then(() => {
        order.push(value);
        // Release immediately so the next can run
        queue.release();
      }),
    );

    await Promise.all(allPromises);

    // Because all items after the first are buffered and sorted, expected:
    // "low" runs first (the very first enqueue gets an immediate slot before sorting)
    // Then CRITICAL, HIGH, NORMAL come out in priority order from the sorted buffer
    expect(order[0]).toBe("low"); // First enqueue gets the slot immediately
    expect(order.slice(1)).toEqual(["critical", "high", "normal"]);
  });

  it("maintains FIFO order within the same priority level", async () => {
    const queue = new PriorityQueue<string>(1);
    const order: string[] = [];

    // First item claims the concurrency slot immediately
    const p1 = queue.enqueue("first", "NORMAL").then(() => {
      order.push("first");
      queue.release();
    });

    // Enqueue three more at same priority
    const p2 = queue.enqueue("second", "NORMAL").then(() => {
      order.push("second");
      queue.release();
    });
    const p3 = queue.enqueue("third", "NORMAL").then(() => {
      order.push("third");
      queue.release();
    });
    const p4 = queue.enqueue("fourth", "NORMAL").then(() => {
      order.push("fourth");
      queue.release();
    });

    await Promise.all([p1, p2, p3, p4]);

    expect(order).toEqual(["first", "second", "third", "fourth"]);
  });

  it("respects concurrency limit", async () => {
    const concurrency = 2;
    const queue = new PriorityQueue<string>(concurrency);
    let runningCount = 0;
    let maxRunning = 0;

    const tasks = Array.from({ length: 5 }, async (_, i) =>
      queue.enqueue(`task-${i}`, "NORMAL").then(async () => {
        runningCount += 1;
        maxRunning = Math.max(maxRunning, runningCount);
        // Simulate async work
        await Promise.resolve();
        runningCount -= 1;
        queue.release();
      }),
    );

    await Promise.all(tasks);

    expect(maxRunning).toBeLessThanOrEqual(concurrency);
  });

  it("size reflects pending items (not running)", async () => {
    const queue = new PriorityQueue<number>(1);

    // First item runs immediately — takes the slot
    const p1 = queue.enqueue(1, "NORMAL");

    // These two are buffered
    void queue.enqueue(2, "NORMAL");
    void queue.enqueue(3, "NORMAL");

    // 2 are waiting in the queue (1 is already running)
    expect(queue.size).toBe(2);

    // Complete the running item
    queue.release();
    // Now one was dequeued (size drops to 1)
    expect(queue.size).toBe(1);

    queue.release();
    expect(queue.size).toBe(0);

    queue.release();
    await p1;
  });

  it("release() unblocks the next waiting item", async () => {
    const queue = new PriorityQueue<string>(1);
    const resolved: string[] = [];

    const p1 = queue.enqueue("first", "NORMAL").then(() => {
      resolved.push("first");
    });
    const p2 = queue.enqueue("second", "NORMAL").then(() => {
      resolved.push("second");
    });

    // After p1 enqueue resolves (immediately), "first" is in resolved
    await p1;
    expect(resolved).toEqual(["first"]);

    // "second" should not be resolved yet
    expect(resolved).toHaveLength(1);

    // Releasing allows second to proceed
    queue.release();
    await p2;
    expect(resolved).toEqual(["first", "second"]);
  });
});
