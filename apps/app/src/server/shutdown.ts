import { getCurrentRedisHandle, getDbHandle } from "@cat/domain";
import { serverLogger as logger } from "@cat/server-shared";

import type { RuntimeCleanupHandle } from "./runtime-cleanup";

/**
 * Server abstraction that can be closed.
 */
export type ClosableServer = {
  /**
   * Close the server.
   *
   * @returns - No return value or a Promise
   */
  close: () => void | Promise<void>;
};

const getRuntimeCleanupHandle = (): RuntimeCleanupHandle | null | undefined => {
  return globalThis.runtimeCleanup;
};

/** Hard deadline (ms) after which the process exits regardless of cleanup state. */
const SHUTDOWN_TIMEOUT_MS = 3_000;

/**
 *
 * - 首次信号：强制关闭所有 TCP 连接，然后尝试清理资源；3 秒内未完成则强制退出。
 * - 第二次及后续信号：立即 `process.exit(1)`，不再等待。
 *
 * Create a shutdown handler (crash-only approach).
 *
 * - First signal: force-close all TCP connections, then attempt resource cleanup;
 *   if not done within 3 s the process is force-exited.
 * - Subsequent signals: immediate `process.exit(1)` — no waiting.
 *
 * @param server - Server instance to close
 * @param nodeServer - Underlying Node.js HTTP server used to force-close all connections
 * @returns - Shutdown function that can be bound to process signals
 */
/** Minimal interface for a Node.js HTTP or HTTP2 server that supports force-closing connections. */
type ServerWithCloseAll = { closeAllConnections(): void };

export const createShutdownHandler = (
  server: ClosableServer,
  nodeServer?: ServerWithCloseAll,
): (() => void) => {
  let invocations = 0;

  return () => {
    invocations += 1;

    // Crash-only escape hatch: second signal exits immediately.
    if (invocations > 1) {
      process.exit(1);
    }

    const handler = async () => {
      logger.withSituation("SERVER").info("Shutting down...");

      // Hard deadline: never hang longer than SHUTDOWN_TIMEOUT_MS.
      const timer = setTimeout(() => {
        logger.withSituation("SERVER").warn("Shutdown timed out, forcing exit");
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);
      timer.unref();

      // Force-close all existing TCP connections (keep-alive, WebSocket) so
      // server.close() resolves immediately instead of waiting for drain.
      nodeServer?.closeAllConnections();

      getRuntimeCleanupHandle()?.stop();
      await Promise.resolve(server.close());

      const redis = getCurrentRedisHandle();
      if (redis) {
        redis.disconnect();
      }

      try {
        await (await getDbHandle()).disconnect();
      } catch {
        // already closed
      }

      clearTimeout(timer);
      process.exit(0);
    };

    handler().catch((err: unknown) => {
      logger
        .withSituation("SERVER")
        .error(err, "Error occurred during server shutdown");
      process.exit(1);
    });
  };
};
