import { beforeEach, describe, expect, it } from "vitest";

import { RedisTaskQueue } from "./redis-task-queue";

type Payload = { value: string };

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const parseJsonObject = (raw: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(raw);

  if (!isRecord(parsed)) {
    throw new Error(`Expected JSON object: ${raw}`);
  }

  return parsed;
};

class FakeRedis {
  public readonly lists = new Map<string, string[]>();

  public async rPush(key: string, values: string | string[]): Promise<number> {
    const list = this.lists.get(key) ?? [];
    const items = Array.isArray(values) ? values : [values];

    list.push(...items);
    this.lists.set(key, list);

    return list.length;
  }

  public async lRange(
    key: string,
    start: number,
    stop: number,
  ): Promise<string[]> {
    const list = this.lists.get(key) ?? [];

    if (start === 0 && stop === -1) {
      return [...list];
    }

    return list.slice(start, stop + 1);
  }

  public async lRem(
    key: string,
    count: number,
    value: string,
  ): Promise<number> {
    const list = this.lists.get(key) ?? [];
    const index = list.indexOf(value);

    if (count <= 0 || index === -1) {
      return 0;
    }

    list.splice(index, 1);
    this.lists.set(key, list);

    return 1;
  }

  public async lLen(key: string): Promise<number> {
    return this.lists.get(key)?.length ?? 0;
  }

  public async sendCommand(args: string[]): Promise<string | number | null> {
    const [, script, , firstKey, secondKey, arg] = args;

    if (script.includes("LPOP")) {
      const pending = this.lists.get(firstKey) ?? [];
      const raw = pending.shift();
      this.lists.set(firstKey, pending);

      if (!raw) {
        return null;
      }

      const task = parseJsonObject(raw);
      const leased = JSON.stringify({ ...task, leasedUntil: arg });
      const processing = this.lists.get(secondKey) ?? [];

      processing.push(leased);
      this.lists.set(secondKey, processing);

      return leased;
    }

    if (script.includes("local taskId = ARGV[1]")) {
      const processing = this.lists.get(firstKey) ?? [];
      const index = processing.findIndex((raw) => {
        const task = parseJsonObject(raw);
        return task["id"] === arg;
      });

      if (index === -1) {
        return 0;
      }

      const [raw] = processing.splice(index, 1);
      const task = parseJsonObject(raw);

      delete task.leasedUntil;
      task.retryCount = Number(task.retryCount ?? 0) + 1;
      this.lists.set(firstKey, processing);
      await this.rPush(secondKey, JSON.stringify(task));

      return 1;
    }

    if (script.includes("local raw = ARGV[1]")) {
      const removed = await this.lRem(firstKey, 1, arg);
      if (removed === 0) {
        return 0;
      }

      const task = parseJsonObject(arg);

      delete task.leasedUntil;
      task.retryCount = Number(task.retryCount ?? 0) + 1;
      await this.rPush(secondKey, JSON.stringify(task));

      return 1;
    }

    throw new Error(`Unsupported script: ${script}`);
  }
}

describe("RedisTaskQueue", () => {
  let redis: FakeRedis;
  let queue: RedisTaskQueue<Payload>;

  beforeEach(() => {
    redis = new FakeRedis();
    queue = new RedisTaskQueue<Payload>(redis, "vectorization", {
      leaseMs: 60_000,
    });
  });

  it("dequeues tasks into processing with leasedUntil", async () => {
    const [taskId] = await queue.enqueue([{ value: "a" }]);

    const [task] = await queue.dequeue(1);

    expect(task.id).toBe(taskId);
    expect(task.leasedUntil).toBeDefined();
    expect(await queue.pendingCount()).toBe(0);
    expect(redis.lists.get("queue:vectorization:processing")).toHaveLength(1);
  });

  it("acks processing tasks by id", async () => {
    await queue.enqueue([{ value: "a" }]);
    const [task] = await queue.dequeue(1);

    await queue.ack(task.id);

    expect(redis.lists.get("queue:vectorization:processing")).toEqual([]);
  });

  it("nacks processing tasks back to pending and increments retryCount", async () => {
    await queue.enqueue([{ value: "a" }]);
    const [task] = await queue.dequeue(1);

    await queue.nack(task.id);
    const [retried] = await queue.dequeue(1);

    expect(retried.id).toBe(task.id);
    expect(retried.retryCount).toBe(1);
  });

  it("keeps the task in processing when the atomic nack script fails", async () => {
    await queue.enqueue([{ value: "a" }]);
    const [task] = await queue.dequeue(1);
    const originalSendCommand = redis.sendCommand.bind(redis);

    redis.sendCommand = async (args) => {
      if (args[1]?.includes("local taskId = ARGV[1]")) {
        throw new Error("script failed");
      }

      return originalSendCommand(args);
    };

    await expect(queue.nack(task.id)).rejects.toThrow("script failed");

    expect(await queue.pendingCount()).toBe(0);
    expect(redis.lists.get("queue:vectorization:processing")).toHaveLength(1);
  });

  it("requeues expired processing leases and leaves fresh leases in place", async () => {
    const expired = JSON.stringify({
      id: "expired",
      payload: { value: "old" },
      retryCount: 0,
      enqueuedAt: new Date("2026-05-24T00:00:00.000Z").toISOString(),
      leasedUntil: new Date(Date.now() - 1_000).toISOString(),
    });
    const fresh = JSON.stringify({
      id: "fresh",
      payload: { value: "new" },
      retryCount: 0,
      enqueuedAt: new Date("2026-05-24T00:00:00.000Z").toISOString(),
      leasedUntil: new Date(Date.now() + 60_000).toISOString(),
    });

    await redis.rPush("queue:vectorization:processing", [expired, fresh]);

    await expect(queue.requeueExpiredLeases()).resolves.toBe(1);

    expect(await queue.pendingCount()).toBe(1);
    expect(redis.lists.get("queue:vectorization:processing")).toEqual([fresh]);
    const [retried] = await queue.dequeue(1);
    expect(retried.id).toBe("expired");
    expect(retried.retryCount).toBe(1);
  });

  it("keeps expired processing entries when the atomic recovery script fails", async () => {
    const expired = JSON.stringify({
      id: "expired",
      payload: { value: "old" },
      retryCount: 0,
      enqueuedAt: new Date("2026-05-24T00:00:00.000Z").toISOString(),
      leasedUntil: new Date(Date.now() - 1_000).toISOString(),
    });

    await redis.rPush("queue:vectorization:processing", expired);
    const originalSendCommand = redis.sendCommand.bind(redis);

    redis.sendCommand = async (args) => {
      if (args[1]?.includes("local raw = ARGV[1]")) {
        throw new Error("script failed");
      }

      return originalSendCommand(args);
    };

    await expect(queue.requeueExpiredLeases()).rejects.toThrow("script failed");

    expect(await queue.pendingCount()).toBe(0);
    expect(redis.lists.get("queue:vectorization:processing")).toEqual([
      expired,
    ]);
  });

  it("keeps malformed processing entries while recovering valid expired entries", async () => {
    await redis.rPush("queue:vectorization:processing", [
      "{not-json",
      JSON.stringify({
        id: "expired",
        payload: { value: "old" },
        retryCount: 2,
        enqueuedAt: new Date("2026-05-24T00:00:00.000Z").toISOString(),
        leasedUntil: new Date(Date.now() - 1_000).toISOString(),
      }),
    ]);

    await expect(queue.requeueExpiredLeases()).resolves.toBe(1);

    expect(redis.lists.get("queue:vectorization:processing")).toEqual([
      "{not-json",
    ]);
    const [retried] = await queue.dequeue(1);
    expect(retried.retryCount).toBe(3);
  });
});
