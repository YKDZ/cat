import { vi } from "vitest";
import type { Job } from "bullmq";

// 定义 handler 注册表，用于存储被拦截的 worker 处理器
const workerHandlers = new Map<string, (job: unknown) => Promise<unknown>>();

/**
 * 初始化 Bull Mock
 * 在测试 setup 文件或每个测试文件顶部调用
 */
// oxlint-disable-next-line explicit-module-boundary-types
export const mockBullUtils = () => {
  vi.mock("@/utils/bull", async () => {
    return {
      getQueue: vi.fn().mockResolvedValue({
        add: vi.fn().mockResolvedValue({ id: "mock-job-id" }), // Mock queue.add
      }),
      getQueueEvents: vi.fn().mockResolvedValue({}),
      getFlowProducer: vi.fn().mockResolvedValue({
        add: vi.fn().mockResolvedValue({ job: { id: "flow-job-id" } }),
      }),
      createWorker: vi.fn().mockImplementation(async (name, processor) => {
        // 关键点：拦截并保存 processor，以便我们在测试中手动调用
        // oxlint-disable-next-line no-unsafe-argument
        workerHandlers.set(name, processor);
        return {
          on: vi.fn(),
          close: vi.fn(),
          waitUntilReady: vi.fn().mockResolvedValue(true),
        };
      }),
    };
  });
};

/**
 * 手动触发一个 Task 或 Workflow 的 Handler
 * 模拟 BullMQ 调度到了这个任务
 */
export const invokeWorker = async <T = unknown, R = unknown>(
  queueName: string,
  data: T,
  opts?: {
    childrenValues?: Record<string, unknown>;
  },
): Promise<R> => {
  const handler = workerHandlers.get(queueName);
  if (!handler) {
    throw new Error(
      `Worker for queue "${queueName}" not registered via createWorker mock.`,
    );
  }

  // 构造 Mock Job
  // oxlint-disable-next-line no-unsafe-type-assertion
  const jobMock = {
    id: "test-job-id",
    data: { ...data, traceId: "test-trace-id" }, // 自动补全 traceId
    getChildrenValues: vi.fn().mockResolvedValue(opts?.childrenValues ?? {}),
    waitUntilFinished: vi.fn().mockResolvedValue({}), // Mock 等待子任务
    updateProgress: vi.fn(),
    log: vi.fn(),
  } as unknown as Job;

  // 执行业务逻辑
  // oxlint-disable-next-line no-unsafe-type-assertion
  return handler(jobMock) as Promise<R>;
};
