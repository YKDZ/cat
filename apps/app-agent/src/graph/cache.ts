import { createHash } from "node:crypto";

export type CacheKeyStrategy = "input-hash" | "custom";

export type CacheOptions = {
  enabled: boolean;
  keyStrategy?: CacheKeyStrategy;
  generateKey?: (payload: unknown) => string;
  ttl?: number;
  onlyCacheSuccess?: boolean;
  namespace?: string;
};

export type CacheStore = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown, ttlSeconds?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
  has: (key: string) => Promise<boolean>;
  clear: () => Promise<void>;
};

type CacheEntry = {
  value: unknown;
  expiresAt?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const sortObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    sorted[key] = sortObjectKeys(value[key]);
  }
  return sorted;
};

export const generateCacheKey = (payload: unknown): string => {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(sortObjectKeys(payload)));
  return hash.digest("hex");
};

export const resolveCacheKey = (
  namespace: string,
  payload: unknown,
  options?: CacheOptions,
): string | null => {
  if (!options?.enabled) return null;

  const key =
    options.keyStrategy === "custom" && options.generateKey
      ? options.generateKey(payload)
      : generateCacheKey(payload);

  const prefix = options.namespace ?? namespace;
  return `${prefix}:${key}`;
};

export class MemoryCacheStore implements CacheStore {
  private readonly storage = new Map<string, CacheEntry>();

  private pruneIfExpired = (key: string): CacheEntry | null => {
    const entry = this.storage.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.storage.delete(key);
      return null;
    }
    return entry;
  };

  get = async (key: string): Promise<unknown> => {
    const entry = this.pruneIfExpired(key);
    if (!entry) return null;
    return structuredClone(entry.value);
  };

  set = async (
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> => {
    this.storage.set(key, {
      value: structuredClone(value),
      expiresAt:
        typeof ttlSeconds === "number" && ttlSeconds > 0
          ? Date.now() + ttlSeconds * 1000
          : undefined,
    });
  };

  delete = async (key: string): Promise<void> => {
    this.storage.delete(key);
  };

  has = async (key: string): Promise<boolean> => {
    return this.pruneIfExpired(key) !== null;
  };

  clear = async (): Promise<void> => {
    this.storage.clear();
  };
}
