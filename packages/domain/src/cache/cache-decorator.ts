import { logger } from "@cat/shared/utils";
import { createHash } from "node:crypto";

import type { CacheOptions, CacheStore, SessionStore } from "@/cache/types";

import { MemoryCacheStore } from "./memory-cache-store";
import { MemorySessionStore } from "./memory-session-store";

declare global {
  // oxlint-disable-next-line no-var
  var __CACHE_STORE__: CacheStore | undefined;
  // oxlint-disable-next-line no-var
  var __SESSION_STORE__: SessionStore | undefined;
}

/**
 * 递归排序对象的 keys，确保嵌套对象也能正确生成缓存键
 */
const sortObjectKeys = (obj: unknown): unknown => {
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
};

/**
 * 生成输入数据的哈希值作为缓存键
 */
export const generateCacheKey = (payload: unknown): string => {
  const hash = createHash("sha256");
  const sortedPayload = sortObjectKeys(payload);
  hash.update(JSON.stringify(sortedPayload));
  return hash.digest("hex");
};

/**
 * 初始化缓存存储
 */
export const initCacheStore = (store: CacheStore): void => {
  globalThis["__CACHE_STORE__"] = store;
};

/**
 * 获取缓存存储实例
 */
export const getCacheStore = (): CacheStore => {
  if (!globalThis["__CACHE_STORE__"]) {
    globalThis["__CACHE_STORE__"] = new MemoryCacheStore();
  }
  return globalThis["__CACHE_STORE__"];
};

/**
 * 初始化会话存储
 */
export const initSessionStore = (store: SessionStore): void => {
  globalThis["__SESSION_STORE__"] = store;
};

/**
 * 获取会话存储实例
 */
export const getSessionStore = (): SessionStore => {
  if (!globalThis["__SESSION_STORE__"]) {
    globalThis["__SESSION_STORE__"] = new MemorySessionStore();
  }
  return globalThis["__SESSION_STORE__"];
};

/**
 * 带缓存的高阶函数包装器
 * 包装一个异步函数，使其自动使用缓存
 */
export const withCache = <I, O>(
  operation: (input: I) => Promise<O>,
  options: CacheOptions,
): ((input: I) => Promise<O>) => {
  return async (input) => {
    if (!options.enabled) {
      return operation(input);
    }

    const store = getCacheStore();
    let key: string;

    if (options.keyStrategy === "custom" && options.generateKey) {
      key = options.generateKey(input);
    } else {
      key = generateCacheKey(input);
    }

    const cached = await store.get<O>(key);
    if (cached !== null) {
      logger.debug(
        {
          key,
        },
        "Cache hit",
      );
      return cached;
    }

    logger.debug(
      {
        key,
      },
      "Cache miss",
    );

    const result = await operation(input);
    await store.set(key, result, options.ttl);
    return result;
  };
};
