import type { QueueTask, TaskQueue } from "@cat/core";
import type { RedisClientType } from "redis";

/**
 * @zh 基于 Redis List 的持久化任务队列。
 * @en Redis List-backed persistent task queue.
 */
export class RedisTaskQueue<T> implements TaskQueue<T> {
  private redis: RedisClientType;
  private pendingKey: string;
  private processingKey: string;

  constructor(redis: RedisClientType, queueName: string) {
    this.redis = redis;
    this.pendingKey = `queue:${queueName}:pending`;
    this.processingKey = `queue:${queueName}:processing`;
  }

  enqueue = async (payloads: T[]): Promise<string[]> => {
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
  };

  dequeue = async (maxCount: number): Promise<QueueTask<T>[]> => {
    const results: QueueTask<T>[] = [];
    for (let i = 0; i < maxCount; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential dequeue required
      const raw = await this.redis.lMove(
        this.pendingKey,
        this.processingKey,
        "LEFT",
        "RIGHT",
      );
      if (raw === null) break;
      // oxlint-disable-next-line no-unsafe-type-assertion -- controlled JSON round-trip
      results.push(JSON.parse(raw) as QueueTask<T>);
    }
    return results;
  };

  ack = async (taskId: string): Promise<void> => {
    const allItems = await this.redis.lRange(this.processingKey, 0, -1);
    for (const item of allItems) {
      // oxlint-disable-next-line no-unsafe-type-assertion -- controlled JSON round-trip
      const task = JSON.parse(item) as QueueTask<T>;
      if (task.id === taskId) {
        // oxlint-disable-next-line no-await-in-loop
        await this.redis.lRem(this.processingKey, 1, item);
        break;
      }
    }
  };

  nack = async (taskId: string): Promise<void> => {
    const allItems = await this.redis.lRange(this.processingKey, 0, -1);
    for (const item of allItems) {
      // oxlint-disable-next-line no-unsafe-type-assertion -- controlled JSON round-trip
      const task = JSON.parse(item) as QueueTask<T>;
      if (task.id === taskId) {
        // oxlint-disable-next-line no-await-in-loop
        await this.redis.lRem(this.processingKey, 1, item);
        const updated: QueueTask<T> = {
          ...task,
          retryCount: task.retryCount + 1,
        };
        // oxlint-disable-next-line no-await-in-loop
        await this.redis.rPush(this.pendingKey, JSON.stringify(updated));
        break;
      }
    }
  };

  pendingCount = async (): Promise<number> => {
    return this.redis.lLen(this.pendingKey);
  };
}
