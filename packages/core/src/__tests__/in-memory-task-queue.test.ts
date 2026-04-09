import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryTaskQueue } from "../in-memory-task-queue.ts";

describe("InMemoryTaskQueue", () => {
  let queue: InMemoryTaskQueue<{ value: string }>;

  beforeEach(() => {
    queue = new InMemoryTaskQueue();
  });

  it("enqueue + dequeue basic flow", async () => {
    const ids = await queue.enqueue([{ value: "a" }, { value: "b" }]);
    expect(ids).toHaveLength(2);

    const tasks = await queue.dequeue(10);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].payload.value).toBe("a");
    expect(tasks[1].payload.value).toBe("b");
  });

  it("dequeue returns at most maxCount items", async () => {
    await queue.enqueue([{ value: "a" }, { value: "b" }, { value: "c" }]);
    const tasks = await queue.dequeue(2);
    expect(tasks).toHaveLength(2);

    const pending = await queue.pendingCount();
    expect(pending).toBe(1);
  });

  it("ack removes task from processing", async () => {
    await queue.enqueue([{ value: "a" }]);
    const [task] = await queue.dequeue(1);
    expect(task).toBeDefined();

    await queue.ack(task.id);

    const pending = await queue.pendingCount();
    expect(pending).toBe(0);

    // Dequeue should return nothing
    const next = await queue.dequeue(1);
    expect(next).toHaveLength(0);
  });

  it("nack re-enqueues task and increments retryCount", async () => {
    await queue.enqueue([{ value: "a" }]);
    const [task] = await queue.dequeue(1);
    expect(task).toBeDefined();
    expect(task.retryCount).toBe(0);

    await queue.nack(task.id);

    const pending = await queue.pendingCount();
    expect(pending).toBe(1);

    const [retried] = await queue.dequeue(1);
    expect(retried).toBeDefined();
    expect(retried.retryCount).toBe(1);
    expect(retried.payload.value).toBe("a");
  });

  it("pendingCount reflects queue state correctly", async () => {
    expect(await queue.pendingCount()).toBe(0);

    await queue.enqueue([{ value: "a" }, { value: "b" }]);
    expect(await queue.pendingCount()).toBe(2);

    await queue.dequeue(1);
    expect(await queue.pendingCount()).toBe(1);
  });

  it("empty queue dequeue returns empty array", async () => {
    const tasks = await queue.dequeue(5);
    expect(tasks).toHaveLength(0);
  });

  it("retryCount increments on each nack", async () => {
    await queue.enqueue([{ value: "x" }]);

    let [task] = await queue.dequeue(1);
    await queue.nack(task.id);

    [task] = await queue.dequeue(1);
    expect(task.retryCount).toBe(1);
    await queue.nack(task.id);

    [task] = await queue.dequeue(1);
    expect(task.retryCount).toBe(2);
  });
});
