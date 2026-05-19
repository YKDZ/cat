import type { AuthBlackboardSnapshot } from "../blackboard.ts";
import type { FlowStorage } from "../scheduler.ts";

/**
 * @zh 供认证 flow 存取快照的最小 cache store 契约。
 * @en Minimal cache store contract for auth flow snapshot persistence.
 */
export type FlowCacheStore = {
  /**
   * @zh 写入一个带 TTL 的缓存值。
   * @en Write a cached value with TTL.
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  /**
   * @zh 读取缓存值。
   * @en Read a cached value.
   */
  get<T>(key: string): Promise<T | null>;
  /**
   * @zh 删除缓存值。
   * @en Delete a cached value.
   */
  delete(key: string): Promise<void>;
};

const KEY_PREFIX = "auth:flow";

/**
 * @zh 基于通用 CacheStore 的认证 flow 存储实现。
 * @en Auth flow storage implementation backed by a generic CacheStore.
 */
export class CacheFlowStorage implements FlowStorage {
  /**
   * @zh 创建一个 CacheStore-backed flow storage。
   * @en Create a CacheStore-backed flow storage.
   *
   * @param cacheStore - {@zh 底层缓存存储} {@en Underlying cache store}
   */
  public constructor(private readonly cacheStore: FlowCacheStore) {}

  /**
   * @zh 保存 flow 快照并设置 TTL。
   * @en Save a flow snapshot with TTL.
   *
   * @param flowId - {@zh flow ID} {@en Flow ID}
   * @param snapshot - {@zh 要持久化的快照} {@en Snapshot to persist}
   * @param ttlSeconds - {@zh TTL（秒）} {@en TTL in seconds}
   * @returns - {@zh 无返回值} {@en No return value}
   */
  public async save(
    flowId: string,
    snapshot: AuthBlackboardSnapshot,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cacheStore.set(`${KEY_PREFIX}:${flowId}`, snapshot, ttlSeconds);
  }

  /**
   * @zh 读取 flow 快照。
   * @en Load a flow snapshot.
   *
   * @param flowId - {@zh flow ID} {@en Flow ID}
   * @returns - {@zh 快照；不存在时为 `null`} {@en Snapshot, or `null` when missing}
   */
  public async load(flowId: string): Promise<AuthBlackboardSnapshot | null> {
    return this.cacheStore.get<AuthBlackboardSnapshot>(
      `${KEY_PREFIX}:${flowId}`,
    );
  }

  /**
   * @zh 删除 flow 快照。
   * @en Delete a flow snapshot.
   *
   * @param flowId - {@zh flow ID} {@en Flow ID}
   * @returns - {@zh 无返回值} {@en No return value}
   */
  public async delete(flowId: string): Promise<void> {
    await this.cacheStore.delete(`${KEY_PREFIX}:${flowId}`);
  }
}
