import { Queue, Worker, FlowProducer, type Job, QueueEvents } from "bullmq";
import { config } from "@/utils/config";

// 缓存实例，避免重复创建
const queues = new Map<string, Queue>();
const queueEvents = new Map<string, QueueEvents>();
const flowProducers = new Map<string, FlowProducer>();

/**
 * 获取或创建一个 Queue 实例
 */
export const getQueue = (name: string): Queue => {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      ...config,
      defaultJobOptions: {
        removeOnComplete: true, // 成功后从 Redis 移除，节省空间
        removeOnFail: 1000, // 保留最近 1000 条失败记录供排查
        attempts: 3, // 默认重试 3 次
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    });
    queues.set(name, queue);
  }
  return queues.get(name)!;
};

export const getQueueEvents = (name: string): QueueEvents => {
  if (!queueEvents.has(name)) {
    queueEvents.set(name, new QueueEvents(name, { ...config }));
  }
  return queueEvents.get(name)!;
};

/**
 * 获取 FlowProducer (用于创建有依赖关系的任务流)
 */
export const getFlowProducer = (): FlowProducer => {
  const key = "default-flow-producer";
  if (!flowProducers.has(key)) {
    flowProducers.set(key, new FlowProducer({ ...config }));
  }
  return flowProducers.get(key)!;
};

/**
 * 创建 Worker 的辅助函数
 */
export const createWorker = async <T, R = unknown>(
  name: string,
  processor: (job: Job<T, R>) => Promise<R>,
  concurrency = 5,
): Promise<Worker<T, R>> => {
  return new Worker<T, R>(
    name,
    async (job) => {
      return await processor(job);
    },
    {
      ...config,
      concurrency,
    },
  );
};
