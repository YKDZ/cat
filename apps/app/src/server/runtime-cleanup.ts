import { serverLogger } from "@cat/server-shared";

/**
 * Runtime store capable of cleaning up expired entries.
 */
export type ExpirableStore = {
  /**
   * Method used to clean up expired data in batches.
   */
  cleanupExpired?: (batchSize?: number) => Promise<number>;
};

const isCleanableStore = (store: object): store is Required<ExpirableStore> => {
  return typeof Reflect.get(store, "cleanupExpired") === "function";
};

/**
 * Stop handle for PostgreSQL runtime cleanup.
 */
export type RuntimeCleanupHandle = {
  /**
   * Stop the background cleanup timer.
   *
   * @returns - No return value
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
 * Start a background cleanup timer for PostgreSQL stores that support `cleanupExpired()`.
 *
 * @param stores - Stores that should participate in cleanup
 * @param env - Environment variables used to resolve cleanup config
 * @returns - Stop handle, or `null` when no stores are cleanable
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
