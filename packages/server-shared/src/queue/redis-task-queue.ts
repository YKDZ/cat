import type { LeaseRecoverableTaskQueue, QueueTask } from "@cat/core";

import { serverLogger } from "../utils/logger";

type RedisQueueClient = {
  rPush: (key: string, values: string | string[]) => Promise<number>;
  lRange: (key: string, start: number, stop: number) => Promise<string[]>;
  lRem: (key: string, count: number, value: string) => Promise<number>;
  lLen: (key: string) => Promise<number>;
  sendCommand: (args: string[]) => Promise<unknown>;
};

/**
 * Optional configuration for the Redis task queue.
 */
export type RedisTaskQueueOptions = {
  /**
   * Lease duration in milliseconds.
   */
  leaseMs?: number;
};

const DEFAULT_LEASE_MS = 60_000;

const DEQUEUE_WITH_LEASE_SCRIPT = `
local raw = redis.call('LPOP', KEYS[1])
if not raw then
  return nil
end
local task = cjson.decode(raw)
task['leasedUntil'] = ARGV[1]
local updated = cjson.encode(task)
redis.call('RPUSH', KEYS[2], updated)
return updated
`;

const NACK_PROCESSING_TASK_SCRIPT = `
local taskId = ARGV[1]
local items = redis.call('LRANGE', KEYS[1], 0, -1)
for _, raw in ipairs(items) do
  local ok, task = pcall(cjson.decode, raw)
  if ok and task['id'] == taskId then
    local removed = redis.call('LREM', KEYS[1], 1, raw)
    if removed == 0 then
      return 0
    end
    task['retryCount'] = (tonumber(task['retryCount']) or 0) + 1
    task['leasedUntil'] = nil
    redis.call('RPUSH', KEYS[2], cjson.encode(task))
    return 1
  end
end
return 0
`;

const REQUEUE_PROCESSING_ITEM_SCRIPT = `
local raw = ARGV[1]
local removed = redis.call('LREM', KEYS[1], 1, raw)
if removed == 0 then
  return 0
end
local task = cjson.decode(raw)
task['retryCount'] = (tonumber(task['retryCount']) or 0) + 1
task['leasedUntil'] = nil
redis.call('RPUSH', KEYS[2], cjson.encode(task))
return 1
`;

/**
 * Redis List-backed persistent task queue.
 */
export class RedisTaskQueue<T> implements LeaseRecoverableTaskQueue<T> {
  private readonly pendingKey: string;
  private readonly processingKey: string;
  private readonly leaseMs: number;

  /**
   * Create a Redis List-backed task queue.
   *
   * @param redis - Redis client
   * @param queueName - Queue name
   * @param options - Lease configuration
   */
  public constructor(
    private readonly redis: RedisQueueClient,
    queueName: string,
    options: RedisTaskQueueOptions = {},
  ) {
    this.pendingKey = `queue:${queueName}:pending`;
    this.processingKey = `queue:${queueName}:processing`;
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  }

  /**
   * Enqueue Redis-backed tasks in batch.
   *
   * @param payloads - List of task payloads to enqueue
   * @returns - Newly generated task IDs
   */
  public async enqueue(payloads: T[]): Promise<string[]> {
    if (payloads.length === 0) return [];

    const ids: string[] = [];
    const serialized: string[] = [];

    for (const payload of payloads) {
      const id = crypto.randomUUID();
      const task: QueueTask<T> = {
        id,
        payload,
        retryCount: 0,
        enqueuedAt: new Date().toISOString(),
      };
      serialized.push(JSON.stringify(task));
      ids.push(id);
    }

    await this.redis.rPush(this.pendingKey, serialized);
    return ids;
  }

  /**
   * Dequeue up to `maxCount` tasks and attach a processing lease.
   *
   * @param maxCount - Maximum number of tasks to dequeue
   * @returns - Dequeued task list
   */
  public async dequeue(maxCount: number): Promise<QueueTask<T>[]> {
    await this.requeueExpiredLeases();

    const results: QueueTask<T>[] = [];
    for (let i = 0; i < maxCount; i += 1) {
      const leasedUntil = new Date(Date.now() + this.leaseMs).toISOString();
      // oxlint-disable-next-line no-await-in-loop -- dequeue must preserve task order and apply one lease atomically per item
      const rawReply = await this.redis.sendCommand([
        "EVAL",
        DEQUEUE_WITH_LEASE_SCRIPT,
        "2",
        this.pendingKey,
        this.processingKey,
        leasedUntil,
      ]);
      if (rawReply === null) break;
      if (typeof rawReply !== "string") {
        throw new Error("Unexpected Redis dequeue response type");
      }
      // oxlint-disable-next-line no-unsafe-type-assertion -- controlled JSON round-trip
      results.push(JSON.parse(rawReply) as QueueTask<T>);
    }

    return results;
  }

  /**
   * Acknowledge completion of a task in processing.
   *
   * @param taskId - Task ID
   * @returns - No return value
   */
  public async ack(taskId: string): Promise<void> {
    const allItems = await this.redis.lRange(this.processingKey, 0, -1);

    for (const item of allItems) {
      const task = this.parseProcessingTask(item);
      if (!task || task.id !== taskId) continue;

      // oxlint-disable-next-line no-await-in-loop -- must stop after deleting the matched processing entry
      await this.redis.lRem(this.processingKey, 1, item);
      break;
    }
  }

  /**
   * Reject a processing task and atomically requeue it.
   *
   * @param taskId - Task ID
   * @returns - No return value
   */
  public async nack(taskId: string): Promise<void> {
    await this.redis.sendCommand([
      "EVAL",
      NACK_PROCESSING_TASK_SCRIPT,
      "2",
      this.processingKey,
      this.pendingKey,
      taskId,
    ]);
  }

  /**
   * Get the current number of pending tasks.
   *
   * @returns - Pending task count
   */
  public async pendingCount(): Promise<number> {
    return this.redis.lLen(this.pendingKey);
  }

  /**
   * Recover tasks whose processing leases have expired.
   *
   * @returns - Number of tasks moved back to pending
   */
  public async requeueExpiredLeases(): Promise<number> {
    const now = Date.now();
    const allItems = await this.redis.lRange(this.processingKey, 0, -1);
    let recovered = 0;

    for (const item of allItems) {
      const task = this.parseProcessingTask(item);
      if (!task) continue;

      const leasedUntilMs = task.leasedUntil
        ? Date.parse(task.leasedUntil)
        : Number.NaN;
      const expired = !Number.isFinite(leasedUntilMs) || leasedUntilMs <= now;
      if (!expired) continue;

      // oxlint-disable-next-line no-await-in-loop -- each expired item must be atomically requeued before moving to the next
      const moved = await this.redis.sendCommand([
        "EVAL",
        REQUEUE_PROCESSING_ITEM_SCRIPT,
        "2",
        this.processingKey,
        this.pendingKey,
        item,
      ]);

      if (this.isRedisIntegerReply(moved, 1)) {
        recovered += 1;
      }
    }

    return recovered;
  }

  private parseProcessingTask(item: string): QueueTask<T> | null {
    try {
      // oxlint-disable-next-line no-unsafe-type-assertion -- controlled queue payload round-trip
      return JSON.parse(item) as QueueTask<T>;
    } catch (err: unknown) {
      serverLogger
        .withSituation("QUEUE")
        .error(
          { queueKey: this.processingKey },
          err,
          "Invalid Redis task JSON",
        );
      return null;
    }
  }

  private isRedisIntegerReply(reply: unknown, expected: number): boolean {
    if (typeof reply === "number") {
      return reply === expected;
    }
    if (typeof reply === "string") {
      return Number(reply) === expected;
    }

    return false;
  }
}
