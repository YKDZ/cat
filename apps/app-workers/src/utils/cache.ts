import { logger } from "@cat/shared/utils";
import { createHash } from "node:crypto";

/**
 * 缓存配置选项
 */
export type CacheOptions = {
  /**
   * 是否启用缓存
   */
  enabled: boolean;
  /**
   * 缓存键的生成策略
   * - 'input-hash': 基于输入数据的哈希（默认）
   * - 'custom': 使用自定义函数生成
   */
  keyStrategy?: "input-hash" | "custom";
  /**
   * 自定义缓存键生成函数
   * 当 keyStrategy 为 'custom' 时使用
   */
  generateKey?: (payload: unknown) => string;
  /**
   * 缓存过期时间（秒）
   * 不设置则永不过期
   */
  ttl?: number;
  /**
   * 是否仅缓存成功的结果
   * 默认为 true
   */
  onlyCacheSuccess?: boolean;
};

/**
 * 缓存存储接口
 */
export interface CacheStore {
  /**
   * 从缓存中获取数据
   */
  get<T>(key: string): Promise<T | null>;
  /**
   * 将数据存入缓存
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  /**
   * 从缓存中删除数据
   */
  delete(key: string): Promise<void>;
  /**
   * 检查缓存是否存在
   */
  has(key: string): Promise<boolean>;
}

/**
 * 基于 Redis 的缓存实现
 * 使用 BullMQ 的 Redis 连接
 */
export class RedisCacheStore implements CacheStore {
  private storage = new Map<string, { value: unknown; expires?: number }>();
  private keyPrefix: string;

  constructor(redisUrl: string, keyPrefix = "cache") {
    this.keyPrefix = keyPrefix;
    // 注意：当前实现使用内存存储
    // 生产环境应该使用真正的 Redis 连接
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const item = this.storage.get(fullKey);

    if (!item) {
      return null;
    }

    // 检查是否过期
    if (item.expires && Date.now() > item.expires) {
      this.storage.delete(fullKey);
      return null;
    }

    // oxlint-disable-next-line no-unsafe-type-assertion
    return item.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const expires = ttl ? Date.now() + ttl * 1000 : undefined;

    this.storage.set(fullKey, { value, expires });

    logger.debug("WORKER", {
      msg: "Cache set",
      key: fullKey,
      ttl,
      expires,
    });
  }

  async delete(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    this.storage.delete(fullKey);

    logger.debug("WORKER", {
      msg: "Cache deleted",
      key: fullKey,
    });
  }

  async has(key: string): Promise<boolean> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const item = this.storage.get(fullKey);

    if (!item) {
      return false;
    }

    // 检查是否过期
    if (item.expires && Date.now() > item.expires) {
      this.storage.delete(fullKey);
      return false;
    }

    return true;
  }
}

/**
 * 递归排序对象的 keys，确保嵌套对象也能正确生成缓存键
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    // oxlint-disable-next-line no-unsafe-type-assertion
    const value = (obj as Record<string, unknown>)[key];
    sorted[key] = sortObjectKeys(value);
  }

  return sorted;
}

/**
 * 生成输入数据的哈希值作为缓存键
 */
export function generateCacheKey(payload: unknown): string {
  const hash = createHash("sha256");
  const sortedPayload = sortObjectKeys(payload);
  hash.update(JSON.stringify(sortedPayload));
  return hash.digest("hex");
}

/**
 * 缓存上下文
 */
export type CacheContext = {
  /**
   * 检查缓存并返回结果（如果存在）
   */
  checkCache: <T>(key: string) => Promise<T | null>;
  /**
   * 将结果存入缓存
   */
  setCache: <T>(key: string, value: T, ttl?: number) => Promise<void>;
  /**
   * 缓存键
   */
  cacheKey?: string;
};

/**
 * 全局缓存实例
 */
let globalCacheStore: CacheStore | null = null;

/**
 * 初始化缓存存储
 */
export function initCacheStore(store: CacheStore): void {
  globalCacheStore = store;
}

/**
 * 获取缓存存储实例
 */
export function getCacheStore(): CacheStore {
  if (!globalCacheStore) {
    // 默认使用内存缓存
    globalCacheStore = new RedisCacheStore("redis://localhost:6379");
  }
  return globalCacheStore;
}

/**
 * 为任务创建缓存上下文
 */
export async function createCacheContext(
  payload: unknown,
  options: CacheOptions,
): Promise<CacheContext> {
  const store = getCacheStore();
  let cacheKey: string | undefined;

  if (options.enabled) {
    if (options.keyStrategy === "custom" && options.generateKey) {
      cacheKey = options.generateKey(payload);
    } else {
      cacheKey = generateCacheKey(payload);
    }
  }

  return {
    cacheKey,
    checkCache: async <T>(key: string): Promise<T | null> => {
      if (!options.enabled) return null;
      return await store.get<T>(key);
    },
    setCache: async <T>(key: string, value: T, ttl?: number): Promise<void> => {
      if (!options.enabled) return;
      await store.set(key, value, ttl ?? options.ttl);
    },
  };
}
