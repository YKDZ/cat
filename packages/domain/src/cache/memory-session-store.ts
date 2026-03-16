import type { SessionStore } from "@/cache/types";

type SessionEntry = {
  fields: Record<string, string>;
  expires?: number;
};

/**
 * 基于内存的会话存储实现
 * 适用于测试和单进程场景
 */
export class MemorySessionStore implements SessionStore {
  private storage = new Map<string, SessionEntry>();

  async create(
    key: string,
    fields: Record<string, string | number>,
    ttlSeconds: number,
  ): Promise<void> {
    const stringFields: Record<string, string> = {};
    for (const [field, value] of Object.entries(fields)) {
      stringFields[field] = String(value);
    }

    const expires = Date.now() + ttlSeconds * 1000;
    this.storage.set(key, { fields: stringFields, expires });
  }

  async getField(key: string, field: string): Promise<string | null> {
    const entry = this.storage.get(key);
    if (!entry) return null;

    if (entry.expires && Date.now() > entry.expires) {
      this.storage.delete(key);
      return null;
    }

    return entry.fields[field] ?? null;
  }

  async getAll(key: string): Promise<Record<string, string> | null> {
    const entry = this.storage.get(key);
    if (!entry) return null;

    if (entry.expires && Date.now() > entry.expires) {
      this.storage.delete(key);
      return null;
    }

    return { ...entry.fields };
  }

  async destroy(key: string): Promise<void> {
    this.storage.delete(key);
  }
}
