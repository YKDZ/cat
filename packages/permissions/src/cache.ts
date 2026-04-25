import type { CacheStore } from "@cat/domain";
import type { Relation } from "@cat/shared";

import { RelationValues } from "@cat/shared";

const permCacheKey = (
  subjectType: string,
  subjectId: string,
  relation: string,
  objectType: string,
  objectId: string,
): string =>
  `perm:${subjectType}:${subjectId}:${relation}:${objectType}:${objectId}`;

/** 权限缓存 TTL（秒）— 安全优先，短 TTL */
const PERM_CACHE_TTL = 60;

export type PermissionCache = {
  getCheckResult: (
    subjectType: string,
    subjectId: string,
    relation: string,
    objectType: string,
    objectId: string,
  ) => Promise<boolean | null>;
  setCheckResult: (
    subjectType: string,
    subjectId: string,
    relation: string,
    objectType: string,
    objectId: string,
    result: boolean,
  ) => Promise<void>;
  invalidate: (
    subjectType: string,
    subjectId: string,
    objectType: string,
    objectId: string,
  ) => Promise<void>;
};

/**
 * 封装 CacheStore 的权限缓存辅助函数。
 * 直接使用 createPermissionEngine 注入的 CacheStore（即 RedisCacheStore）。
 */
export const createPermissionCache = (store: CacheStore): PermissionCache => ({
  getCheckResult: async (
    subjectType: string,
    subjectId: string,
    relation: string,
    objectType: string,
    objectId: string,
  ): Promise<boolean | null> => {
    const key = permCacheKey(
      subjectType,
      subjectId,
      relation,
      objectType,
      objectId,
    );
    return store.get<boolean>(key);
  },

  setCheckResult: async (
    subjectType: string,
    subjectId: string,
    relation: string,
    objectType: string,
    objectId: string,
    result: boolean,
  ): Promise<void> => {
    const key = permCacheKey(
      subjectType,
      subjectId,
      relation,
      objectType,
      objectId,
    );
    await store.set(key, result, PERM_CACHE_TTL);
  },

  /** grant/revoke 时按 subject + object 维度清除缓存 */
  invalidate: async (
    subjectType: string,
    subjectId: string,
    objectType: string,
    objectId: string,
  ): Promise<void> => {
    const relations: Relation[] = [...RelationValues];
    await Promise.all(
      relations.map(async (rel) =>
        store.delete(
          permCacheKey(subjectType, subjectId, rel, objectType, objectId),
        ),
      ),
    );
  },
});
