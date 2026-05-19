import { and, eq, runtimeQueueTask } from "@cat/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

import { PostgresTaskQueue } from "./postgres-task-queue";

type TaskPayload = {
  task: string;
};

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("PostgresTaskQueue", () => {
  it("supports enqueue, dequeue, maxCount, ack, and pendingCount", async () => {
    const queue = new PostgresTaskQueue<TaskPayload>(
      testDb.client,
      `queue_${randomUUID()}`,
      { maxRetries: 2 },
    );

    const ids = await queue.enqueue([{ task: "a" }, { task: "b" }]);
    expect(ids).toHaveLength(2);
    expect(await queue.pendingCount()).toBe(2);

    const firstBatch = await queue.dequeue(1);
    expect(firstBatch).toHaveLength(1);
    expect(typeof firstBatch[0].enqueuedAt).toBe("string");
    expect(await queue.pendingCount()).toBe(1);

    await queue.ack(firstBatch[0].id);

    const secondBatch = await queue.dequeue(10);
    expect(secondBatch).toHaveLength(1);
    expect(secondBatch[0].payload.task).toBe("b");
    expect(await queue.pendingCount()).toBe(0);
  });

  it("requeues expired leases back to pending", async () => {
    const queueName = `queue_${randomUUID()}`;
    const queue = new PostgresTaskQueue<TaskPayload>(testDb.client, queueName, {
      leaseMs: 50,
      maxRetries: 2,
    });

    const [taskId] = await queue.enqueue([{ task: "lease" }]);
    const [dequeued] = await queue.dequeue(1);
    expect(dequeued?.id).toBe(taskId);

    await testDb.client
      .update(runtimeQueueTask)
      .set({ leasedUntil: new Date(Date.now() - 1_000) })
      .where(
        and(
          eq(runtimeQueueTask.queueName, queueName),
          eq(runtimeQueueTask.taskId, taskId),
        ),
      );

    expect(await queue.requeueExpiredLeases()).toBe(1);
    expect(await queue.pendingCount()).toBe(1);

    const [retried] = await queue.dequeue(1);
    expect(retried?.id).toBe(taskId);
  });

  it("increments retry count and marks tasks as failed after max retries", async () => {
    const queueName = `queue_${randomUUID()}`;
    const queue = new PostgresTaskQueue<TaskPayload>(testDb.client, queueName, {
      maxRetries: 2,
    });

    const [taskId] = await queue.enqueue([{ task: "fail-me" }]);
    const [first] = await queue.dequeue(1);
    expect(first?.id).toBe(taskId);

    await queue.nack(taskId);
    expect(await queue.pendingCount()).toBe(1);

    const [second] = await queue.dequeue(1);
    expect(second?.id).toBe(taskId);
    await queue.nack(taskId);
    expect(await queue.pendingCount()).toBe(0);

    const [row] = await testDb.client
      .select({
        status: runtimeQueueTask.status,
        retryCount: runtimeQueueTask.retryCount,
      })
      .from(runtimeQueueTask)
      .where(
        and(
          eq(runtimeQueueTask.queueName, queueName),
          eq(runtimeQueueTask.taskId, taskId),
        ),
      )
      .limit(1);

    expect(row).toMatchObject({ status: "FAILED", retryCount: 2 });
  });
});
