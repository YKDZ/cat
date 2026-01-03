import type { Job } from "bullmq";
import { z } from "zod";
import {
  getQueue,
  getFlowProducer,
  createWorker,
  getQueueEvents,
} from "@/utils/bull";
import { getTraceId } from "@/utils/message";
import { logger } from "@cat/shared/utils";
import type {
  DefineTaskOptions,
  DefineWorkflowOptions,
  TaskDefinition,
  ZodObjectAny,
  RunResult,
  WorkflowHandlerContext,
} from "@/core/types";

/**
 * 辅助函数：折叠大对象用于日志输出
 * - 数组显示为 Array(N)
 * - 对象显示为 {Object}
 * - 长字符串截断
 */
const summarize = (obj: unknown): unknown => {
  if (obj === null || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return `[Array(${obj.length})]`;
  }

  const summary: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key === "traceId") {
      summary[key] = value; // 保留 traceId
      continue;
    }

    if (Array.isArray(value)) {
      summary[key] = `[Array(${value.length})]`;
    } else if (typeof value === "object" && value !== null) {
      summary[key] = "{Object}";
    } else if (typeof value === "string" && value.length > 100) {
      summary[key] = `${value.slice(0, 100)}...`;
    } else {
      summary[key] = value;
    }
  }
  return summary;
};

/**
 * 执行回滚栈
 */
const executeRollbacks = async (
  rollbacks: (() => Promise<void>)[],
  taskName: string,
  traceId: string,
) => {
  if (rollbacks.length === 0) return;

  logger.warn("PROCESSOR", {
    msg: `[${taskName}] Execution failed, starting rollback...`,
    traceId,
    count: rollbacks.length,
  });

  // 后进先出 (LIFO) 执行
  const reversed = [...rollbacks].reverse();

  for (const rollback of reversed) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      await rollback();
    } catch (err) {
      logger.error(
        "PROCESSOR",
        {
          msg: `[${taskName}] Rollback step failed`,
          traceId,
        },
        err,
      );
      // 继续执行剩余的回滚，尽量恢复
    }
  }

  logger.info("PROCESSOR", {
    msg: `[${taskName}] Rollback finished`,
    traceId,
  });
};

export const defineTask = async <
  I extends ZodObjectAny,
  O extends ZodObjectAny,
>(
  options: DefineTaskOptions<I, O>,
): Promise<TaskDefinition<I, O>> => {
  const {
    name,
    input: inputSchema,
    output: outputSchema,
    handler,
    concurrency,
  } = options;
  const queueName = name;

  const worker = await createWorker(
    queueName,
    async (job) => {
      const traceId = getTraceId(job.data);
      // 初始化回滚栈
      const rollbacks: (() => Promise<void>)[] = [];
      const onRollback = (fn: () => Promise<void>) => rollbacks.push(fn);

      logger.debug("PROCESSOR", {
        msg: `[Task:${name}] Start`,
        jobId: job.id,
        traceId,
        input: summarize(job.data),
      });

      try {
        const parsedInput = inputSchema.parse(job.data);

        // 注入 onRollback 到 handler
        const result = await handler(parsedInput, { traceId, onRollback });

        logger.debug("PROCESSOR", {
          msg: `[Task:${name}] Success`,
          jobId: job.id,
          traceId,
          output: summarize(result),
        });

        if (outputSchema) {
          return outputSchema.parse(result);
        }
        return result;
      } catch (error) {
        await executeRollbacks(rollbacks, `Task:${name}`, traceId);

        logger.error(
          "PROCESSOR",
          { msg: `[Task:${name}] Failed`, traceId, jobId: job.id },
          error,
        );
        throw error;
      }
    },
    concurrency,
  );

  logger.debug("PROCESSOR", {
    msg: `Defined task ${name}`,
  });

  return {
    name,
    schema: { input: inputSchema, output: outputSchema },
    worker,
    handler,
    run: async (payload, meta): Promise<RunResult<z.infer<I>, z.infer<O>>> => {
      const traceId = meta?.traceId ?? crypto.randomUUID();
      const queue = getQueue(queueName);
      const queueEvents = getQueueEvents(queueName);

      const data = inputSchema.parse(payload);
      const job = await queue.add(name, { ...data, traceId });

      logger.debug("PROCESSOR", {
        msg: `[Task:${name}] Dispatched`,
        jobId: job.id,
        traceId,
      });

      // 立即启动监听，避免 Job 在 removeOnComplete 后丢失事件
      // 捕获 catch 是为了防止 promise 拒绝时触发 UnhandledPromiseRejection，
      // 真正的错误处理会在用户 await result() 时发生。
      const finishedPromise = job.waitUntilFinished(queueEvents);
      // oxlint-disable-next-line no-empty-function
      finishedPromise.catch(() => {});

      return {
        job,
        result: async () => {
          // 等待之前创建的 promise
          const rawResult = await finishedPromise;

          if (outputSchema) {
            return outputSchema.parse(rawResult);
          }

          // oxlint-disable-next-line no-unsafe-type-assertion
          return rawResult as z.infer<O>;
        },
      };
    },
    asChild: (payload, meta) => {
      const traceId = meta?.traceId ?? crypto.randomUUID();
      const data = inputSchema.parse(payload);
      return {
        name,
        queueName,
        data: { ...data, traceId },
        opts: {
          // 包含 name 前缀供 getTaskResult 过滤使用
          jobId: `${name}:${traceId}:${crypto.randomUUID().slice(0, 8)}`,
          removeOnComplete: true,
        },
      };
    },
  };
};

export const defineWorkflow = async <
  I extends ZodObjectAny,
  O extends ZodObjectAny,
>(
  options: DefineWorkflowOptions<I, O>,
): Promise<TaskDefinition<I, O, WorkflowHandlerContext>> => {
  const { name, input: inputSchema, dependencies, handler } = options;
  const queueName = name;

  // 注册 Barrier Worker
  const worker = await createWorker(queueName, async (job) => {
    const traceId = getTraceId(job.data);
    const rollbacks: (() => Promise<void>)[] = [];
    const onRollback = (fn: () => Promise<void>) => rollbacks.push(fn);

    logger.debug("PROCESSOR", {
      msg: `[Workflow:${name}] Barrier Reached`,
      jobId: job.id,
      traceId,
    });

    const payload = inputSchema.parse(job.data);
    const childrenValues = await job.getChildrenValues();

    logger.debug("PROCESSOR", {
      msg: `[Workflow:${name}] Children Values Keys`,
      traceId,
      keys: Object.keys(childrenValues),
    });

    const getTaskResult = <
      Ti extends ZodObjectAny,
      To extends ZodObjectAny,
      Ctx,
    >(
      taskDef: TaskDefinition<Ti, To, Ctx>,
    ): z.infer<To>[] => {
      const results: z.infer<To>[] = [];

      Object.entries(childrenValues).forEach(([key, value]) => {
        // BullMQ 返回的 Key 格式为 prefix:queueName:jobId
        // 我们在 asChild 中生成的 JobId 格式为 taskName:traceId:uuid
        // 因此，匹配 Key 是否包含 ":taskName:traceId:"
        if (key.includes(`:${taskDef.name}:${traceId}:`)) {
          // 如果定义了 Output Schema，则进行运行时验证，确保类型安全
          if (taskDef.schema.output) {
            results.push(taskDef.schema.output.parse(value));
          } else {
            // 如果没有 Schema，且 value 确有值，不得不进行断言
            // oxlint-disable-next-line no-unsafe-type-assertion
            results.push(value as z.infer<To>);
          }
        }
      });

      return results;
    };

    try {
      const result = await handler(payload, {
        traceId,
        results: childrenValues,
        getTaskResult,
        onRollback,
      });

      logger.debug("PROCESSOR", {
        msg: `[Workflow:${name}] Barrier Success`,
        jobId: job.id,
        traceId,
        result: summarize(result),
      });

      return result;
    } catch (error) {
      await executeRollbacks(rollbacks, `Workflow:${name}`, traceId);

      logger.error(
        "PROCESSOR",
        { msg: `[Workflow:${name}] Barrier Failed`, traceId, jobId: job.id },
        error,
      );

      throw error;
    }
  });

  const runFlow = async (payload: z.infer<I>, meta?: { traceId?: string }) => {
    const traceId = meta?.traceId ?? crypto.randomUUID();
    const data = inputSchema.parse(payload);

    logger.debug("PROCESSOR", {
      msg: `[Workflow:${name}] Building Flow Tree`,
      traceId,
      input: summarize(data),
    });

    const flowProducer = getFlowProducer();

    const children = dependencies(data, { traceId });

    logger.debug("PROCESSOR", {
      msg: `[Workflow:${name}] Dependencies calculated`,
      traceId,
      childCount: children.length,
    });

    const flowNode = {
      name,
      queueName,
      data: { ...data, traceId },
      children,
      opts: {
        jobId: `${name}:root:${traceId}`,
        removeOnComplete: true,
      },
    };

    return flowProducer.add(flowNode);
  };

  logger.debug("PROCESSOR", {
    msg: `Defined workflow ${name}`,
  });

  return {
    name,
    schema: { input: inputSchema, output: options.output },
    worker,
    handler,

    run: async (payload, meta): Promise<RunResult<z.infer<I>, z.infer<O>>> => {
      const queueEvents = getQueueEvents(queueName);

      const jobNode = await runFlow(payload, meta);
      // oxlint-disable-next-line no-unsafe-type-assertion
      const job = jobNode.job as Job<z.infer<I>, z.infer<O>>;

      logger.debug("PROCESSOR", {
        msg: `[Workflow:${name}] Flow Dispatched`,
        jobId: job.id,
        traceId: meta?.traceId,
      });

      // 立即启动监听，避免 Job 在 removeOnComplete 后丢失事件
      // 捕获 catch 是为了防止 promise 拒绝时触发 UnhandledPromiseRejection，
      // 真正的错误处理会在用户 await result() 时发生。
      const finishedPromise = job.waitUntilFinished(queueEvents);
      // oxlint-disable-next-line no-empty-function
      finishedPromise.catch(() => {});

      return {
        job,

        result: async () => {
          const rawResult = await finishedPromise;

          if (options.output) {
            return options.output.parse(rawResult);
          }
          return rawResult;
        },
      };
    },

    asChild: (payload, meta) => {
      const traceId = meta?.traceId ?? crypto.randomUUID();
      const data = inputSchema.parse(payload);

      // 递归构建依赖树
      // 这里的 children 是子工作流的 Barrier Job（如果是工作流）或原子 Task Job
      const children = dependencies(data, { traceId });

      return {
        name,
        queueName,
        data: { ...data, traceId },
        children,
        opts: {
          // 生成唯一的 JobID，格式需满足 getTaskResult 的匹配规则: :taskName:traceId:
          // 使用随机后缀允许在同一个父流程中多次调用同一个子工作流
          jobId: `${name}:${traceId}:${crypto.randomUUID().slice(0, 8)}`,
          removeOnComplete: true,
        },
      };
    },
  };
};
