import { Queue, Worker } from "bullmq";
import type { QueueOptions } from "bullmq";
import { logger } from "@cat/shared/utils";
import type {
  WorkerDefinition,
  WorkerInstance,
  WorkerContext,
  QueueJobOptions,
} from "./types.ts";
import { createTaskLifecycleHandler } from "./task-lifecycle.ts";
import { composeMiddleware } from "./middleware.ts";
import { config } from "../utils/config.js";
import type { DrizzleClient } from "@cat/db";
import type { ZodType } from "zod/v4";

// oxlint-disable-next-line no-empty-object-type
export interface WorkerInputTypeMap {}

export class WorkerRegistry {
  private workers = new Map<string, WorkerInstance>();
  private definitions = new Map<
    string,
    WorkerDefinition<ZodType, ZodType, WorkerContext>
  >();

  constructor(private readonly queueConfig: QueueOptions = config) {}

  /**
   * 注册一个 Worker
   */
  register<
    TInputSchema extends ZodType,
    TOutputSchema extends ZodType | undefined = undefined,
  >(definition: WorkerDefinition<TInputSchema, TOutputSchema>): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Worker "${definition.id}" is already registered`);
    }

    // 类型擦除：将具体类型的 definition 存储为 unknown 类型
    // 这是安全的，因为在使用时会通过 inputSchema 进行运行时验证
    this.definitions.set(
      definition.id,
      // oxlint-disable-next-line no-unsafe-type-assertion
      definition as WorkerDefinition<ZodType, ZodType, WorkerContext>,
    );

    logger.info("PROCESSOR", {
      msg: `Registered worker: ${definition.id}`,
    });
  }

  /**
   * 启动所有已注册的 Workers
   */
  async startAll(drizzle: DrizzleClient): Promise<void> {
    const startPromises = Array.from(this.definitions.values()).map(
      async (def) => this.start(def.id, drizzle),
    );

    await Promise.all(startPromises);
    logger.info("PROCESSOR", {
      msg: `Started ${this.workers.size} workers`,
    });
  }

  /**
   * 启动指定的 Worker
   */
  async start(
    workerId: string,
    drizzle: DrizzleClient,
  ): Promise<WorkerInstance> {
    if (this.workers.has(workerId)) {
      logger.warn("PROCESSOR", {
        msg: `Worker "${workerId}" is already running`,
      });
      return this.workers.get(workerId)!;
    }

    const definition = this.definitions.get(workerId);
    if (!definition) {
      throw new Error(`Worker "${workerId}" is not registered`);
    }

    const queue = new Queue(definition.id, this.queueConfig);

    const worker = new Worker(
      definition.id,
      async (job) => {
        // 验证输入数据
        const input = definition.inputSchema.parse(job.data);

        // 构建执行上下文
        const ctx: WorkerContext = {
          job,
          input,
          taskId: job.name,
          taskType: definition.taskType,
        };

        try {
          // 执行 beforeExecute 钩子
          if (definition.hooks?.beforeExecute) {
            await definition.hooks.beforeExecute(ctx);
          }

          // 组合中间件
          const middleware = definition.middleware || [];
          const composedExecute = composeMiddleware(
            middleware,
            definition.execute,
          );

          // 执行任务
          let result = await composedExecute(ctx);

          // 执行 afterExecute 钩子
          if (definition.hooks?.afterExecute) {
            const hookResult = await definition.hooks.afterExecute(ctx, result);
            if (hookResult !== undefined) {
              result = hookResult;
            }
          }

          // 验证输出
          if (definition.outputSchema) {
            result = definition.outputSchema.parse(result);
          }

          // 执行 onComplete 钩子
          if (definition.hooks?.onComplete) {
            await definition.hooks.onComplete(ctx, result);
          }

          return result;
        } catch (error) {
          // 执行错误钩子
          if (definition.hooks?.onError) {
            await definition.hooks.onError(ctx, error);
          }
          throw error;
        }
      },
      {
        ...this.queueConfig,
        ...definition.options,
      },
    );

    // 注册任务生命周期处理器 (更新数据库状态)
    createTaskLifecycleHandler(drizzle, worker, definition.id);

    // 注册 onFailed 钩子
    if (definition.hooks?.onFailed) {
      worker.on("failed", (job, error) => {
        if (!job) return;
        // 调用用户定义的 onFailed 钩子
        Promise.resolve(definition.hooks!.onFailed!(job, error)).catch(
          (hookError: unknown) => {
            logger.error(
              "PROCESSOR",
              {
                msg: `onFailed hook error for worker ${definition.id}`,
                jobId: job.id,
              },
              hookError,
            );
          },
        );
      });
    }

    // Worker 错误处理
    worker.on("error", (error) => {
      logger.error(
        "PROCESSOR",
        { msg: `Worker ${definition.id} error` },
        error,
      );
    });

    const instance: WorkerInstance = {
      id: definition.id,
      queue,
      worker,
      shutdown: async () => {
        await worker.close();
        await queue.close();
      },
    };

    this.workers.set(workerId, instance);

    logger.info("PROCESSOR", {
      msg: `Started worker: ${definition.id}`,
    });

    return instance;
  }

  async addJob<TWorkerId extends keyof WorkerInputTypeMap>(
    workerId: TWorkerId,
    data: WorkerInputTypeMap[TWorkerId],
    options: QueueJobOptions,
  ): Promise<void>;

  async addJob(
    workerId: string,
    data: unknown,
    options: QueueJobOptions,
  ): Promise<void> {
    const instance = this.workers.get(workerId);
    if (!instance) {
      throw new Error(
        `Worker "${workerId}" is not running. Call start() first.`,
      );
    }

    await instance.queue.add(options.jobId, data, {
      ...this.definitions.get(workerId)?.defaultJobOptions,
      ...options,
      jobId: options.jobId,
    });

    logger.info("PROCESSOR", {
      msg: `Added job to ${workerId}: ${options.jobId}`,
    });
  }

  /**
   * 获取 Worker 实例
   */
  getWorker(workerId: string): WorkerInstance | undefined {
    return this.workers.get(workerId);
  }

  /**
   * 获取 Queue 实例
   */
  getQueue(workerId: string): Queue | undefined {
    return this.workers.get(workerId)?.queue;
  }

  /**
   * 关闭所有 Workers
   */
  async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.workers.values()).map(
      async (instance) => instance.shutdown(),
    );

    await Promise.all(shutdownPromises);

    this.workers.clear();

    logger.info("PROCESSOR", {
      msg: "All workers shut down successfully",
    });
  }

  /**
   * 关闭指定 Worker
   */
  async shutdownWorker(workerId: string): Promise<void> {
    const instance = this.workers.get(workerId);
    if (!instance) {
      logger.warn("PROCESSOR", {
        msg: `Worker "${workerId}" is not running`,
      });
      return;
    }

    await instance.shutdown();
    this.workers.delete(workerId);

    logger.info("PROCESSOR", {
      msg: `Worker "${workerId}" shut down successfully`,
    });
  }

  /**
   * 获取所有已注册的 Worker IDs
   */
  getRegisteredWorkers(): string[] {
    return Array.from(this.definitions.keys());
  }

  /**
   * 获取所有正在运行的 Worker IDs
   */
  getRunningWorkers(): string[] {
    return Array.from(this.workers.keys());
  }
}
