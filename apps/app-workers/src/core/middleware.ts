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
