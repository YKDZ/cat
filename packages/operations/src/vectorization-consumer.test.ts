import type { VectorizationTask } from "@cat/server-shared";

import { InMemoryTaskQueue } from "@cat/core";
import { afterEach, describe, expect, it, vi } from "vitest";

// ─── Mock @cat/domain ────────────────────────────────────────────────────────

const { mockPublish, mockGetDbHandle, mockExecuteCommand } = vi.hoisted(() => ({
  mockPublish: vi.fn().mockResolvedValue(undefined),
  mockGetDbHandle: vi.fn().mockResolvedValue({ client: {} }),
  mockExecuteCommand: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@cat/domain", () => ({
  getDbHandle: mockGetDbHandle,
  executeCommand: mockExecuteCommand,
  domainEventBus: { publish: mockPublish },
  domainEvent: (type: string, payload: unknown) =>
    // oxlint-disable-next-line no-unsafe-type-assertion
    ({ type, payload }) as { type: string; payload: unknown },
  attachChunkSetToString: "attachChunkSetToString",
  updateVectorizedStringStatus: "updateVectorizedStringStatus",
}));

// ─── Mock vectorizeToChunkSetOp ──────────────────────────────────────────────

const { mockVectorizeToChunkSetOp } = vi.hoisted(() => ({
  mockVectorizeToChunkSetOp: vi.fn(),
}));

vi.mock("./vectorize", () => ({
  vectorizeToChunkSetOp: mockVectorizeToChunkSetOp,
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { processVectorizationBatch } from "./vectorization-consumer";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeTask = (
  overrides?: Partial<VectorizationTask>,
): VectorizationTask => ({
  taskId: "task-1",
  stringIds: [1, 2],
  data: [
    { text: "hello", languageId: "en" },
    { text: "world", languageId: "en" },
  ],
  vectorizerId: 10,
  vectorStorageId: 20,
  ...overrides,
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("processVectorizationBatch", () => {
  it("returns early on empty queue", async () => {
    const queue = new InMemoryTaskQueue<VectorizationTask>();
    await processVectorizationBatch(queue, 10);
    expect(mockVectorizeToChunkSetOp).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("vectorizes a task and publishes vectorization:completed on success", async () => {
    const queue = new InMemoryTaskQueue<VectorizationTask>();
    mockVectorizeToChunkSetOp.mockResolvedValueOnce({
      chunkSetIds: [100, 200],
    });

    await queue.enqueue([makeTask()]);
    await processVectorizationBatch(queue, 10);

    expect(mockVectorizeToChunkSetOp).toHaveBeenCalledOnce();
    expect(mockExecuteCommand).toHaveBeenCalledOnce();

    // oxlint-disable-next-line no-unsafe-type-assertion
    const publishedEvent = mockPublish.mock.calls[0]?.[0] as {
      type: string;
      payload: { stringIds: number[]; taskId: string };
    };
    expect(publishedEvent?.type).toBe("vectorization:completed");
    expect(publishedEvent?.payload?.stringIds).toEqual([1, 2]);
    expect(publishedEvent?.payload?.taskId).toBe("task-1");

    // Task should be acked (pendingCount = 0)
    expect(await queue.pendingCount()).toBe(0);
  });

  it("nacks the task on vectorization failure and does not publish failed if retryCount < MAX_RETRIES-1", async () => {
    const queue = new InMemoryTaskQueue<VectorizationTask>();
    mockVectorizeToChunkSetOp.mockRejectedValueOnce(new Error("timeout"));

    await queue.enqueue([makeTask()]);
    await processVectorizationBatch(queue, 10);

    // Task is nacked back to pending (retryCount = 0, MAX_RETRIES-1 = 2)
    expect(await queue.pendingCount()).toBe(1);
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it("marks status VECTORIZE_FAILED and publishes vectorization:failed after MAX_RETRIES exhausted", async () => {
    const queue = new InMemoryTaskQueue<VectorizationTask>();
    mockVectorizeToChunkSetOp.mockRejectedValue(new Error("timeout"));

    await queue.enqueue([makeTask()]);

    // Exhaust retries (MAX_RETRIES = 3, so task.retryCount reaches 2 on 3rd nack)
    await processVectorizationBatch(queue, 10); // retryCount → 1
    await processVectorizationBatch(queue, 10); // retryCount → 2
    await processVectorizationBatch(queue, 10); // retryCount >= 2 → mark failed

    // oxlint-disable-next-line no-unsafe-type-assertion
    const publishedEvent = mockPublish.mock.calls[0]?.[0] as {
      type: string;
      payload: { stringIds: number[]; taskId: string };
    };
    expect(publishedEvent?.type).toBe("vectorization:failed");
    expect(publishedEvent?.payload?.stringIds).toEqual([1, 2]);

    // updateVectorizedStringStatus called with VECTORIZE_FAILED
    expect(mockExecuteCommand).toHaveBeenCalledOnce();
    // oxlint-disable-next-line no-unsafe-type-assertion
    const statusArgs = mockExecuteCommand.mock.calls[0]?.[2] as
      | { status: string }
      | undefined;
    expect(statusArgs?.status).toBe("VECTORIZE_FAILED");
  });

  it("processes a batch of multiple tasks", async () => {
    const queue = new InMemoryTaskQueue<VectorizationTask>();
    mockVectorizeToChunkSetOp
      .mockResolvedValueOnce({ chunkSetIds: [101, 102] })
      .mockResolvedValueOnce({ chunkSetIds: [201, 202] });

    await queue.enqueue([
      makeTask({ taskId: "t1", stringIds: [1, 2] }),
      makeTask({ taskId: "t2", stringIds: [3, 4] }),
    ]);

    await processVectorizationBatch(queue, 10);

    expect(mockVectorizeToChunkSetOp).toHaveBeenCalledTimes(2);
    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(await queue.pendingCount()).toBe(0);
  });
});
