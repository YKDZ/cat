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
import type { ZodType } from "zod/v4";
import { FlowOrchestrator, type FlowDefinition } from "./workflow.ts";
import { randomUUID } from "node:crypto";
import type { ScopeType } from "@cat/shared/schema/drizzle/enum";
import { PluginRegistry } from "@cat/plugin-core";

// oxlint-disable-next-line no-empty-object-type
export interface WorkerInputTypeMap {}

// oxlint-disable-next-line no-empty-object-type
export interface FlowInputTypeMap {}

export class WorkerRegistry {
  private workers = new Map<string, WorkerInstance>();
  private definitions = new Map<
    string,
    WorkerDefinition<ZodType, ZodType, WorkerContext>
  >();
  private flowDefinitions = new Map<string, FlowDefinition>();
  private orchestrator?: FlowOrchestrator;

  constructor(
    private readonly queueConfig: QueueOptions = config,
    private readonly scopeType: ScopeType,
    private readonly scopeId: string,
    private readonly pluginRegistry: PluginRegistry = PluginRegistry.get(
      scopeType,
      scopeId,
    ),
  ) {}

  public static get(scopeType: ScopeType, scopeId: string): WorkerRegistry {
    const key = `__WORKER_REGISTRY_${scopeType}_${scopeId}__`;
    // @ts-expect-error hard to declare type for globalThis
    if (!globalThis[key])
      // @ts-expect-error hard to declare type for globalThis
      globalThis[key] = new WorkerRegistry(scopeType, scopeId);
    // @ts-expect-error hard to declare type for globalThis oxlint-disable-next-line no-unsafe-type-assertion
    // oxlint-disable no-unsafe-type-assertion
    return globalThis[key] as WorkerRegistry;
  }

  /**
   * 注册一个 Worker
   */
  public registerWorker<
    TInputSchema extends ZodType,
    TOutputSchema extends ZodType | undefined = undefined,
  >(definition: WorkerDefinition<TInputSchema, TOutputSchema>): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Worker "${definition.id}" is already registered`);
    }

    this.definitions.set(
      definition.id,
      // oxlint-disable-next-line no-unsafe-type-assertion
      definition as WorkerDefinition<ZodType, ZodType, WorkerContext>,
    );

    logger.info("PROCESSOR", {
      msg: `Registered worker: ${definition.id}`,
    });
  }

  public registerFlow<TInput>(definition: FlowDefinition<TInput>): void {
    if (this.flowDefinitions.has(definition.id)) {
      throw new Error(`Flow "${definition.id}" is already registered`);
    }

    this.flowDefinitions.set(
      definition.id,
      // oxlint-disable-next-line no-unsafe-type-assertion
      definition as FlowDefinition,
    );

    logger.info("PROCESSOR", {
      msg: `Registered flow: ${definition.id}`,
    });
  }

  /**
   * 批量注册一个模块的 workers 和 flows
   * 类型安全地注册模块导出的所有内容
   *
   * 注意: 使用类型擦除处理复杂泛型,在运行时保证类型安全
   */
  public registerModule(module: {
    readonly workers?: Readonly<Record<string, unknown>>;
    readonly flows?: Readonly<Record<string, unknown>>;
  }): void {
    if (module.workers) {
      for (const worker of Object.values(module.workers)) {
        // 类型擦除: worker 已在 defineWorker 中被正确类型化
        // @ts-expect-error - 类型擦除用于简化复杂泛型的注册
        this.registerWorker(worker);
      }
    }

    if (module.flows) {
      for (const flow of Object.values(module.flows)) {
        // 类型擦除: flow 已在 defineFlow 中被正确类型化
        // @ts-expect-error - 类型擦除用于简化复杂泛型的注册
        this.registerFlow(flow);
      }
    }
  }

  /**
   * 批量注册多个模块
   */
  public registerModules(
    modules: ReadonlyArray<{
      readonly workers?: Readonly<Record<string, unknown>>;
      readonly flows?: Readonly<Record<string, unknown>>;
    }>,
  ): void {
    for (const module of modules) {
      this.registerModule(module);
    }
  }

  /**
   * 启动所有已注册的 Workers
   */
  public async startAll(): Promise<void> {
    const startPromises = Array.from(this.definitions.values()).map(
      async (def) => this.start(def.id),
    );

    await Promise.all(startPromises);
    logger.info("PROCESSOR", {
      msg: `Started ${this.workers.size} workers`,
    });
  }

  /**
   * 启动指定的 Worker
   */
  public async start(workerId: string): Promise<WorkerInstance> {
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
        const inputResult = definition.inputSchema.safeParse(job.data);

        if (!inputResult.success) {
          logger.error(
            "PROCESSOR",
            {
              msg: `Invalid input for worker ${definition.id}`,
              jobId: job.id,
              data: job.data,
            },
            inputResult.error,
          );
          throw new Error("Invalid input");
        }

        // 构建执行上下文
        const ctx: WorkerContext = {
          job,
          input: inputResult.data,
          pluginRegistry: this.pluginRegistry,
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
            const parsed = definition.outputSchema.safeParse(result);
            if (!parsed.success) {
              logger.error(
                "PROCESSOR",
                {
                  msg: `Invalid output for worker ${definition.id}`,
                  jobId: job.id,
                  data: result,
                },
                parsed.error,
              );
              throw new Error("Invalid output");
            }
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

    // 注册任务生命周期处理器
    createTaskLifecycleHandler(worker, definition.id);

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

  public async addJob<TWorkerId extends keyof WorkerInputTypeMap>(
    workerId: TWorkerId,
    data: WorkerInputTypeMap[TWorkerId],
    options?: QueueJobOptions,
  ): Promise<void>;

  public async addJob(
    workerId: string,
    data: unknown,
    options?: QueueJobOptions,
  ): Promise<void> {
    const instance = this.workers.get(workerId);
    if (!instance) {
      throw new Error(
        `Worker "${workerId}" is not running. Call start() first.`,
      );
    }

    const jobId = options?.jobId ?? randomUUID();

    await instance.queue.add(jobId, data, {
      ...this.definitions.get(workerId)?.defaultJobOptions,
      ...options,
      jobId,
    });

    logger.info("PROCESSOR", {
      msg: `Added job to ${workerId}: ${jobId}`,
    });
  }

  public async executeFlow<TFlowId extends keyof FlowInputTypeMap>(
    flowId: TFlowId,
    input: FlowInputTypeMap[TFlowId],
    options?: QueueJobOptions,
  ): Promise<unknown> {
    const definition = this.flowDefinitions.get(flowId as string);

    if (!definition) {
      throw new Error(`Flow "${String(flowId)}" is not registered`);
    }

    const orchestrator = this.getOrchestrator();

    const result = await orchestrator.execute(
      // oxlint-disable-next-line no-unsafe-type-assertion
      definition as FlowDefinition<FlowInputTypeMap[TFlowId]>,
      input,
      options,
    );

    const jobId = options?.jobId ?? randomUUID();

    logger.info("PROCESSOR", {
      msg: `Enqueued flow: ${String(flowId)}`,
      jobId,
    });

    return result;
  }

  /**
   * 获取 Worker 实例
   */
  public getWorker(workerId: string): WorkerInstance | undefined {
    return this.workers.get(workerId);
  }

  /**
   * 获取 Queue 实例
   */
  public getQueue(workerId: string): Queue | undefined {
    return this.workers.get(workerId)?.queue;
  }

  /**
   * 关闭所有 Workers
   */
  public async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.workers.values()).map(
      async (instance) => instance.shutdown(),
    );

    await Promise.all(shutdownPromises);

    this.workers.clear();

    if (this.orchestrator) {
      await this.orchestrator.close();
      this.orchestrator = undefined;
    }

    logger.info("PROCESSOR", {
      msg: "All workers shutdown successfully",
    });
  }

  /**
   * 关闭指定 Worker
   */
  public async shutdownWorker(workerId: string): Promise<void> {
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
      msg: `Worker "${workerId}" shutdown successfully`,
    });
  }

  /**
   * 获取所有已注册的 Worker IDs
   */
  public getRegisteredWorkers(): string[] {
    return Array.from(this.definitions.keys());
  }

  /**
   * 获取所有正在运行的 Worker IDs
   */
  public getRunningWorkers(): string[] {
    return Array.from(this.workers.keys());
  }

  public getRegisteredFlows(): string[] {
    return Array.from(this.flowDefinitions.keys());
  }

  private getOrchestrator(): FlowOrchestrator {
    if (!this.orchestrator) {
      this.orchestrator = new FlowOrchestrator(
        this.queueConfig,
        this.pluginRegistry,
      );
    }

    return this.orchestrator;
  }

  public getScopeType(): ScopeType {
    return this.scopeType;
  }

  public getScopeId(): string {
    return this.scopeId;
  }
}
