import type { TaskQueue } from "@cat/core";
import type { VectorizationTask } from "@cat/server-shared";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  processVectorizationBatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@cat/core", () => ({
  isLeaseRecoverableTaskQueue: <T>(
    queue: TaskQueue<T> & { requeueExpiredLeases?: () => Promise<number> },
  ) => {
    return typeof queue.requeueExpiredLeases === "function";
  },
}));

vi.mock("@cat/domain", () => ({
  domainEventBus: { subscribe: mocks.subscribe },
}));

vi.mock("./vectorization-consumer", () => ({
  processVectorizationBatch: mocks.processVectorizationBatch,
}));

const loadRegisterVectorizationConsumer = async () => {
  vi.resetModules();
  const module = await import("./register-vectorization-consumer");
  return module.registerVectorizationConsumer;
};

const makeQueue = (
  overrides?: Partial<TaskQueue<VectorizationTask>> & {
    requeueExpiredLeases?: () => Promise<number>;
  },
): TaskQueue<VectorizationTask> & {
  requeueExpiredLeases?: () => Promise<number>;
} => ({
  enqueue: vi.fn().mockResolvedValue([]),
  dequeue: vi.fn().mockResolvedValue([]),
  ack: vi.fn().mockResolvedValue(undefined),
  nack: vi.fn().mockResolvedValue(undefined),
  pendingCount: vi.fn().mockResolvedValue(0),
  ...overrides,
});

describe("registerVectorizationConsumer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("awaits lease recovery before subscribing to enqueue events", async () => {
    const registerVectorizationConsumer =
      await loadRegisterVectorizationConsumer();
    const calls: string[] = [];
    const queue = makeQueue({
      requeueExpiredLeases: vi.fn(async () => {
        calls.push("recover");
        return 2;
      }),
      pendingCount: vi.fn(async () => {
        calls.push("pendingCount");
        return 0;
      }),
    });

    mocks.subscribe.mockImplementation(() => {
      calls.push("subscribe");
      return () => undefined;
    });

    await registerVectorizationConsumer(queue, { batchSize: 5 });

    expect(calls.slice(0, 2)).toEqual(["recover", "subscribe"]);
  });

  it("rejects when lease recovery fails and does not subscribe", async () => {
    const registerVectorizationConsumer =
      await loadRegisterVectorizationConsumer();
    const queue = makeQueue({
      requeueExpiredLeases: vi.fn().mockRejectedValue(new Error("redis down")),
    });

    await expect(registerVectorizationConsumer(queue)).rejects.toThrow(
      "redis down",
    );
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
});
