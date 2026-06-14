import type { AuthBlackboardSnapshot } from "../blackboard.ts";
import type { FlowStorage } from "../scheduler.ts";

/**
 * Minimal cache store contract for auth flow snapshot persistence.
 */
export type FlowCacheStore = {
  /**
   * Write a cached value with TTL.
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  /**
   * Read a cached value.
   */
  get<T>(key: string): Promise<T | null>;
  /**
   * Delete a cached value.
   */
  delete(key: string): Promise<void>;
};

const KEY_PREFIX = "auth:flow";

/**
 * Auth flow storage implementation backed by a generic CacheStore.
 */
export class CacheFlowStorage implements FlowStorage {
  /**
   * Create a CacheStore-backed flow storage.
   *
   * @param cacheStore - Underlying cache store
   */
  public constructor(private readonly cacheStore: FlowCacheStore) {}

  /**
   * Save a flow snapshot with TTL.
   *
   * @param flowId - Flow ID
   * @param snapshot - Snapshot to persist
   * @param ttlSeconds - TTL in seconds
   * @returns - No return value
   */
  public async save(
    flowId: string,
    snapshot: AuthBlackboardSnapshot,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cacheStore.set(`${KEY_PREFIX}:${flowId}`, snapshot, ttlSeconds);
  }

  /**
   * Load a flow snapshot.
   *
   * @param flowId - Flow ID
   * @returns - Snapshot, or `null` when missing
   */
  public async load(flowId: string): Promise<AuthBlackboardSnapshot | null> {
    return this.cacheStore.get<AuthBlackboardSnapshot>(
      `${KEY_PREFIX}:${flowId}`,
    );
  }

  /**
   * Delete a flow snapshot.
   *
   * @param flowId - Flow ID
   * @returns - No return value
   */
  public async delete(flowId: string): Promise<void> {
    await this.cacheStore.delete(`${KEY_PREFIX}:${flowId}`);
  }
}
