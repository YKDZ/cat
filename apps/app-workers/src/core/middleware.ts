import { logger } from "@cat/shared/utils";
import type { WorkerContext, WorkerMiddleware } from "./types.ts";

export function composeMiddleware<TInput, TOutput>(
  middleware: WorkerMiddleware<TInput, TOutput>[],
  execute: (ctx: WorkerContext<TInput>) => Promise<TOutput>,
): (ctx: WorkerContext<TInput>) => Promise<TOutput> {
  if (middleware.length === 0) {
    return execute;
  }

  return async (ctx: WorkerContext<TInput>): Promise<TOutput> => {
    let index = -1;

    const dispatch = async (i: number): Promise<TOutput> => {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }

      index = i;

      if (i === middleware.length) {
        // 所有中间件执行完毕,执行核心逻辑
        return await execute(ctx);
      }

      const fn = middleware[i];
      return await fn(ctx, async () => dispatch(i + 1));
    };

    return await dispatch(0);
  };
}

/**
 * 内置中间件 - 日志记录
 */
export function loggingMiddleware<TInput, TOutput>(): WorkerMiddleware<
  TInput,
  TOutput
> {
  return async (ctx, next) => {
    const startTime = Date.now();

    try {
      const result = await next();
      const duration = Date.now() - startTime;

      logger.info("PROCESSOR", {
        msg: `Task ${ctx.taskId} completed`,
        taskType: ctx.taskType,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(
        "PROCESSOR",
        {
          msg: `Task ${ctx.taskId} failed`,
          taskType: ctx.taskType,
          duration,
        },
        error,
      );

      throw error;
    }
  };
}

/**
 * 内置中间件 - 性能追踪
 */
export function performanceMiddleware<TInput, TOutput>(): WorkerMiddleware<
  TInput,
  TOutput
> {
  return async (ctx, next) => {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();

    const result = await next();

    const endTime = performance.now();
    const endMemory = process.memoryUsage();

    const metrics = {
      taskId: ctx.taskId,
      taskType: ctx.taskType,
      duration: endTime - startTime,
      memoryDelta: {
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        external: endMemory.external - startMemory.external,
      },
    };

    // 可以发送到 metrics 系统
    logger.info("PROCESSOR", {
      msg: "Task performance metrics",
      ...metrics,
    });

    return result;
  };
}
