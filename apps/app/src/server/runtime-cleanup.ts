import { serverLogger } from "@cat/server-shared";

/**
 * @zh 具备过期清理能力的运行时 store。
 * @en Runtime store capable of cleaning up expired entries.
 */
export type ExpirableStore = {
  /**
   * @zh 批量清理过期数据的方法。
   * @en Method used to clean up expired data in batches.
   */
  cleanupExpired?: (batchSize?: number) => Promise<number>;
};

const isCleanableStore = (store: object): store is Required<ExpirableStore> => {
  return typeof Reflect.get(store, "cleanupExpired") === "function";
};

/**
 * @zh PostgreSQL runtime cleanup 的停止句柄。
 * @en Stop handle for PostgreSQL runtime cleanup.
 */
export type RuntimeCleanupHandle = {
  /**
   * @zh 停止后台清理定时器。
   * @en Stop the background cleanup timer.
   *
   * @returns - {@zh 无返回值} {@en No return value}
   */
  stop(): void;
};

const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * @zh 为支持 `cleanupExpired()` 的 PostgreSQL store 启动后台清理定时器。
 * @en Start a background cleanup timer for PostgreSQL stores that support `cleanupExpired()`.
 *
 * @param stores - {@zh 需要参与清理的 store 列表} {@en Stores that should participate in cleanup}
 * @param env - {@zh 用于读取清理配置的环境变量} {@en Environment variables used to resolve cleanup config}
 * @returns - {@zh 停止句柄；若没有可清理 store 则返回 `null`} {@en Stop handle, or `null` when no stores are cleanable}
 */
export const startPostgresRuntimeCleanup = (
  stores: object[],
  env: NodeJS.ProcessEnv = process.env,
): RuntimeCleanupHandle | null => {
  const cleanableStores = stores.filter(isCleanableStore);
  if (cleanableStores.length === 0) {
    return null;
  }

  const intervalMs = parsePositiveInt(
    env.CAT_PG_STORE_CLEANUP_INTERVAL_MS,
    600_000,
  );
  const batchSize = parsePositiveInt(env.CAT_PG_STORE_CLEANUP_BATCH_SIZE, 500);
  const timer = setInterval(() => {
    void Promise.all(
      cleanableStores.map(async (store) => store.cleanupExpired(batchSize)),
    ).catch((error: unknown) => {
      serverLogger.warn(
        { err: error },
        "PostgreSQL runtime store cleanup failed",
      );
    });
  }, intervalMs);
  timer.unref?.();

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
};
