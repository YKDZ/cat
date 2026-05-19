import { getCurrentRedisHandle, getDbHandle } from "@cat/domain";
import { serverLogger as logger } from "@cat/server-shared";

import type { RuntimeCleanupHandle } from "./runtime-cleanup";

/**
 * @zh 可被优雅关闭的服务器抽象。
 * @en Server abstraction that can be closed gracefully.
 */
export type ClosableServer = {
  /**
   * @zh 关闭服务器连接。
   * @en Close the server.
   *
   * @returns - {@zh 无返回值或 Promise} {@en No return value or a Promise}
   */
  close: () => void | Promise<void>;
};

const getRuntimeCleanupHandle = (): RuntimeCleanupHandle | null | undefined => {
  return globalThis.runtimeCleanup;
};

/**
 * @zh 创建一个幂等的优雅关闭处理器。
 * @en Create an idempotent graceful shutdown handler.
 *
 * @param server - {@zh 需要关闭的服务器实例} {@en Server instance to close}
 * @returns - {@zh 可绑定到进程信号的关闭函数} {@en Shutdown function that can be bound to process signals}
 */
export const createShutdownHandler = (server: ClosableServer): (() => void) => {
  let isShuttingDown = false;

  return () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    const handler = async () => {
      logger
        .withSituation("SERVER")
        .info("About to shutdown server gracefully...");

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

      logger
        .withSituation("SERVER")
        .info("Successfully shutdown gracefully. Goodbye");
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
