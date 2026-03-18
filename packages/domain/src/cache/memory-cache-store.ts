import { logger } from "@cat/shared/utils";

import type { CacheStore } from "@/cache/types";

/**
 * 基于内存的缓存实现
 * 适用于测试和单进程场景
 */
export class MemoryCacheStore implements CacheStore {
  private storage = new Map<string, { value: unknown; expires?: number }>();
  private keyPrefix: string;

  constructor(keyPrefix = "cache") {
    this.keyPrefix = keyPrefix;
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const item = this.storage.get(fullKey);

    if (!item) {
      return null;
    }

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

    logger.debug(
      {
        key: fullKey,
        ttl,
        expires,
      },
      "Cache set",
    );
  }

  async delete(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    this.storage.delete(fullKey);

    logger.debug(
      {
        key: fullKey,
      },
      "Cache deleted",
    );
  }

  async has(key: string): Promise<boolean> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const item = this.storage.get(fullKey);

    if (!item) {
      return false;
    }

    if (item.expires && Date.now() > item.expires) {
      this.storage.delete(fullKey);
      return false;
    }

    return true;
  }
}
