import type { Job, JobsOptions, WorkerOptions } from "bullmq";
import type { z, ZodType } from "zod/v4";

export type InferSchema<T extends ZodType | undefined> = T extends ZodType
  ? z.infer<T>
  : unknown;

/**
 * Worker 执行上下文
 * 提供给每个任务执行时的运行环境
 */
export interface WorkerContext<TInput = unknown> {
  /** BullMQ Job */
  job: Job<TInput>;
  input: TInput;
}

/**
 * Worker 定义配置
 * 使用泛型确保类型安全
 */
export interface WorkerDefinition<
  TInputSchema extends ZodType | undefined = undefined,
  TOutputSchema extends ZodType | undefined = undefined,
  TContext extends WorkerContext<InferSchema<TInputSchema>> = WorkerContext<
    InferSchema<TInputSchema>
  >,
> {
  id: string;
  inputSchema: TInputSchema;
  outputSchema?: TOutputSchema;
  execute: (ctx: TContext) => Promise<InferSchema<TOutputSchema>>;
  options?: WorkerOptions;
  defaultJobOptions?: JobsOptions;
  hooks?: WorkerHooks<
    InferSchema<TInputSchema>,
    InferSchema<TOutputSchema>,
    TContext
  >;
  middleware?: WorkerMiddleware<
    InferSchema<TInputSchema>,
    InferSchema<TOutputSchema>,
    TContext
  >[];
}

/**
 * Worker 生命周期钩子
 */
export interface WorkerHooks<
  TInput = unknown,
  TOutput = unknown,
  TContext extends WorkerContext<TInput> = WorkerContext<TInput>,
> {
  /** 执行前钩子 */
  beforeExecute?: (ctx: TContext) => Promise<void> | void;

  /** 执行后钩子 */
  afterExecute?: (
    ctx: TContext,
    result: TOutput,
  ) => Promise<void | TOutput> | void | TOutput;

  /** 错误处理钩子 (在执行过程中抛出错误时调用) */
  onError?: (ctx: TContext, error: unknown) => Promise<void> | void;

  /** 完成钩子 (任务成功完成后调用) */
  onComplete?: (ctx: TContext, result: TOutput) => Promise<void> | void;

  /**
   * 失败钩子 (任务失败后调用，基于 BullMQ 的 'failed' 事件)
   * 注意：此钩子接收的是原始 Job 对象，而不是 WorkerContext
   */
  onFailed?: (job: Job<TInput>, error: Error) => Promise<void> | void;
}

export type WorkerMiddleware<
  TInput = unknown,
  TOutput = unknown,
  TContext extends WorkerContext<TInput> = WorkerContext<TInput>,
> = (ctx: TContext, next: () => Promise<TOutput>) => Promise<TOutput> | TOutput;

export interface WorkerInstance {
  id: string;
  queue: import("bullmq").Queue;
  worker: import("bullmq").Worker;
  shutdown: () => Promise<void>;
}

export interface QueueJobOptions extends JobsOptions {
  jobId?: string;
  meta?: Record<string, unknown>;
}
