import type { AuthBlackboardSnapshot } from "../blackboard.ts";
import type { FlowStorage } from "../scheduler.ts";

/** Minimal cache-store contract for auth-flow snapshot persistence. */
export type FlowCacheStore = {
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
};

const KEY_PREFIX = "auth:flow";

/** Auth-flow storage backed by a generic cache store. */
export class CacheFlowStorage implements FlowStorage {
  private readonly cacheStore: FlowCacheStore;

  public constructor(cacheStore: FlowCacheStore) {
    this.cacheStore = cacheStore;
  }

  public async save(
    flowId: string,
    snapshot: AuthBlackboardSnapshot,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cacheStore.set(`${KEY_PREFIX}:${flowId}`, snapshot, ttlSeconds);
  }

  public async load(flowId: string): Promise<AuthBlackboardSnapshot | null> {
    return this.cacheStore.get<AuthBlackboardSnapshot>(
      `${KEY_PREFIX}:${flowId}`,
    );
  }

  public async delete(flowId: string): Promise<void> {
    await this.cacheStore.delete(`${KEY_PREFIX}:${flowId}`);
  }
}
