import type { CacheStore, DbHandle } from "@cat/domain";

import { createPermissionEngine, type PermissionEngine } from "@/engine";

declare global {
  // oxlint-disable-next-line no-var
  var __PERMISSION_ENGINE__: PermissionEngine | undefined;
}

/**
 * 获取全局单例 PermissionEngine。
 * 必须在调用前先通过 initPermissionEngine 初始化。
 */
export const getPermissionEngine = (): PermissionEngine => {
  if (!globalThis.__PERMISSION_ENGINE__) {
    throw new Error(
      "PermissionEngine not initialized. Call initPermissionEngine first.",
    );
  }
  return globalThis.__PERMISSION_ENGINE__;
};

/**
 * 初始化全局 PermissionEngine 单例。
 * 在应用启动时调用一次。
 */
export const initPermissionEngine = (deps: {
  db: DbHandle;
  cache: CacheStore;
  auditEnabled?: boolean;
}): PermissionEngine => {
  const engine = createPermissionEngine({
    db: deps.db,
    cache: deps.cache,
    auditEnabled: deps.auditEnabled ?? true,
  });
  globalThis.__PERMISSION_ENGINE__ = engine;
  return engine;
};
