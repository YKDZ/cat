import type { RedisClientType } from "redis";

import type { AuthBlackboardSnapshot } from "../blackboard.ts";
import type { FlowStorage } from "../scheduler.ts";

const KEY_PREFIX = "auth:flow";

export class RedisFlowStorage implements FlowStorage {
  private readonly redis: RedisClientType;
  constructor(redis: RedisClientType) {
    this.redis = redis;
  }

  async save(
    flowId: string,
    snapshot: AuthBlackboardSnapshot,
    ttlSeconds: number,
  ): Promise<void> {
    const key = `${KEY_PREFIX}:${flowId}`;
    await this.redis.set(key, JSON.stringify(snapshot), { EX: ttlSeconds });
  }

  async load(flowId: string): Promise<AuthBlackboardSnapshot | null> {
    const key = `${KEY_PREFIX}:${flowId}`;
    const raw = await this.redis.get(key);
    if (raw === null) return null;
    // oxlint-disable-next-line no-unsafe-type-assertion -- deserialization from JSON
    return JSON.parse(raw) as AuthBlackboardSnapshot;
  }

  async delete(flowId: string): Promise<void> {
    const key = `${KEY_PREFIX}:${flowId}`;
    await this.redis.del(key);
  }
}
