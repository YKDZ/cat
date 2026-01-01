import type { FlowChildJob, Job, Worker } from "bullmq";
import type z from "zod";

/**
 * 约束 Input/Output 必须为 Zod Object，避免 spread 标量类型出错
 * 使用 ZodRawShape 避免显式的 explicit any
 */
export type ZodObjectAny = z.ZodObject<z.ZodRawShape>;

/**
 * run() 方法的返回结果
 * 包含原始 Job 实例和一个类型安全的等待辅助函数
 */
export type RunResult<I, O> = {
  job: Job<I, O>;
  /**
   * 等待任务完成并获取结果
   * 如果任务失败，这里会抛出异常
   */
  result: () => Promise<O>;
};

export type TaskDefinition<
  I extends ZodObjectAny,
  O extends ZodObjectAny,
  Ctx = TaskHandlerContext,
> = {
  name: string;
  schema: {
    input: I;
    output?: O;
  };
  worker: Worker;
  /**
   * 原始处理函数
   */
  handler: (payload: z.infer<I>, ctx: Ctx) => Promise<z.infer<O>>;
  /**
   * 启动独立任务
   */
  run: (
    input: z.infer<I>,
    meta?: { traceId?: string },
  ) => Promise<RunResult<z.infer<I>, z.infer<O>>>;
  /**
   * 构建为子任务节点（用于 Workflow）
   */
  asChild: (input: z.infer<I>, meta?: { traceId?: string }) => FlowChildJob;
};

/**
 * 获取子任务结果的上下文工具
 */
export type WorkflowHandlerContext = {
  traceId: string;
  /**
   * 原始子任务结果，Key 为 JobID
   */
  results: Record<string, unknown>;
  /**
   * 类型安全地获取指定任务的输出结果
   * 自动过滤出属于该 TaskDefinition 的结果，并使用 Schema 解析
   */
  getTaskResult: <Ti extends ZodObjectAny, To extends ZodObjectAny, Ctx>(
    task: TaskDefinition<Ti, To, Ctx>,
  ) => z.infer<To>[];
  /**
   * Workflow Barrier 回滚
   */
  onRollback?: (fn: () => Promise<void>) => void;
};

export type DefineTaskOptions<
  I extends ZodObjectAny,
  O extends ZodObjectAny,
> = {
  name: string;
  input: I;
  output?: O;
  handler: (
    payload: z.infer<I>,
    ctx: TaskHandlerContext,
  ) => Promise<z.infer<O>>;
  concurrency?: number;
};

export type DefineWorkflowOptions<
  I extends ZodObjectAny,
  O extends ZodObjectAny,
> = {
  name: string;
  input: I;
  output?: O;
  dependencies: (
    payload: z.infer<I>,
    context: { traceId: string },
  ) => FlowChildJob[];
  handler: (
    payload: z.infer<I>,
    context: WorkflowHandlerContext,
  ) => Promise<z.infer<O>>;
};

export type TaskHandlerContext = {
  traceId: string;
  /**
   * 注册一个回滚函数。
   * 当任务执行失败（抛出异常）时，框架会自动按注册顺序的**逆序**执行这些函数。
   */
  onRollback?: (fn: () => Promise<void>) => void;
};
