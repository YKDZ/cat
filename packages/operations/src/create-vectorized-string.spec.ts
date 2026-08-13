import { ServiceImplementationReferenceSchema } from "@cat/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createVectorizedStrings: Symbol("createVectorizedStrings"),
  domainEvent: vi.fn(
    (name: string, payload: unknown, options?: { eventId?: string }) => ({
      name,
      payload,
      eventId: options?.eventId,
      timestamp: new Date().toISOString(),
    }),
  ),
  domainEventBus: {
    publish: vi.fn(),
  },
  executeCommand: vi.fn(),
  executeQuery: vi.fn(),
  getDbHandle: vi.fn(),
  getVectorizationQueue: vi.fn(),
  listVectorizedStringsById: Symbol("listVectorizedStringsById"),
}));

vi.mock("@cat/domain", () => ({
  createVectorizedStrings: mocked.createVectorizedStrings,
  domainEvent: mocked.domainEvent,
  domainEventBus: mocked.domainEventBus,
  executeCommand: mocked.executeCommand,
  executeQuery: mocked.executeQuery,
  getDbHandle: mocked.getDbHandle,
  listVectorizedStringsById: mocked.listVectorizedStringsById,
}));

vi.mock("@cat/server-shared", () => ({
  getVectorizationQueue: mocked.getVectorizationQueue,
}));

import { createVectorizedStringOp } from "./create-vectorized-string.ts";

const vectorizer = ServiceImplementationReferenceSchema.parse({
  pluginId: "test-plugin",
  serviceId: "vectorizer",
  serviceType: "TEXT_VECTORIZER",
  scopeType: "GLOBAL",
  scopeId: "",
});

const vectorStorage = ServiceImplementationReferenceSchema.parse({
  pluginId: "test-plugin",
  serviceId: "vector-storage",
  serviceType: "VECTOR_STORAGE",
  scopeType: "GLOBAL",
  scopeId: "",
});

describe("createVectorizedStringOp", () => {
  beforeEach(() => {
    mocked.executeCommand.mockReset();
    mocked.executeQuery.mockReset();
    mocked.getDbHandle.mockReset();
    mocked.getVectorizationQueue.mockReset();
    mocked.domainEvent.mockClear();
    mocked.domainEventBus.publish.mockReset();
  });

  it("creates string rows without enqueueing vectorization when services are unavailable", async () => {
    const tx = { tag: "tx" };
    const db = {
      tag: "db",
      transaction: vi.fn(async (callback: (handle: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    mocked.getDbHandle.mockResolvedValue({ client: db });
    mocked.executeCommand.mockResolvedValue([11, 12]);

    const result = await createVectorizedStringOp({
      data: [
        { text: "Prompt", languageId: "en-US" },
        { text: "提示", languageId: "zh-CN" },
      ],
    });

    expect(mocked.executeCommand).toHaveBeenCalledWith(
      { db: tx },
      mocked.createVectorizedStrings,
      {
        data: [
          { text: "Prompt", languageId: "en-US" },
          { text: "提示", languageId: "zh-CN" },
        ],
      },
    );
    expect(mocked.getVectorizationQueue).not.toHaveBeenCalled();
    expect(mocked.domainEventBus.publish).not.toHaveBeenCalled();
    expect(result).toEqual({ stringIds: [11, 12] });
  });

  it("enqueues vectorization when both service references are available", async () => {
    const tx = { tag: "tx" };
    const db = {
      tag: "db",
      transaction: vi.fn(async (callback: (handle: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    mocked.getDbHandle.mockResolvedValue({ client: db });
    mocked.executeCommand.mockResolvedValue([21]);
    mocked.executeQuery.mockResolvedValue([
      { id: 21, status: "PENDING_VECTORIZE" },
    ]);
    mocked.getVectorizationQueue.mockReturnValue(queue);
    queue.enqueue.mockResolvedValue(["stable-task-id"]);

    const result = await createVectorizedStringOp({
      data: [{ text: "Prompt", languageId: "en-US" }],
      vectorizer,
      vectorStorage,
    });

    expect(mocked.getVectorizationQueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          stringIds: [21],
          data: [{ text: "Prompt", languageId: "en-US" }],
          vectorizer,
          vectorStorage,
        }),
      ],
      { taskIds: [expect.stringMatching(/^vectorization:v1:/)] },
    );
    expect(mocked.domainEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "vectorization:enqueued",
        payload: expect.objectContaining({ stringIds: [21] }),
      }),
    );
    expect(result).toEqual({ stringIds: [21] });
  });

  it("does not duplicate queue work when replayed before the graph marker", async () => {
    const tx = { tag: "tx" };
    const db = {
      tag: "db",
      transaction: vi.fn(async (callback: (handle: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const insertedIds = new Set<string>();
    const queue = {
      enqueue: vi.fn(
        async (
          _payloads: unknown[],
          options?: { taskIds?: string[] },
        ): Promise<string[]> => {
          const taskId = options?.taskIds?.[0];
          if (taskId === undefined || insertedIds.has(taskId)) return [];
          insertedIds.add(taskId);
          return [taskId];
        },
      ),
    };
    mocked.getDbHandle.mockResolvedValue({ client: db });
    mocked.executeCommand.mockResolvedValue([31]);
    mocked.executeQuery.mockResolvedValue([
      { id: 31, status: "PENDING_VECTORIZE" },
    ]);
    mocked.getVectorizationQueue.mockReturnValue(queue);

    const input = {
      data: [{ text: "Replay-safe prompt", languageId: "en-US" }],
      vectorizer,
      vectorStorage,
    };
    await createVectorizedStringOp(input);
    await createVectorizedStringOp(input);

    expect(queue.enqueue).toHaveBeenCalledTimes(2);
    const firstTaskId = queue.enqueue.mock.calls[0]?.[1]?.taskIds?.[0];
    const secondTaskId = queue.enqueue.mock.calls[1]?.[1]?.taskIds?.[0];
    expect(firstTaskId).toMatch(/^vectorization:v1:/);
    expect(secondTaskId).toBe(firstTaskId);
    expect(insertedIds).toEqual(new Set([firstTaskId]));
    expect(mocked.domainEventBus.publish).toHaveBeenCalledTimes(2);
    const firstHint = mocked.domainEventBus.publish.mock.calls[0]?.[0];
    const secondHint = mocked.domainEventBus.publish.mock.calls[1]?.[0];
    expect(secondHint).toMatchObject({
      name: firstHint?.name,
      payload: firstHint?.payload,
      eventId: firstHint?.eventId,
    });
  });
});
