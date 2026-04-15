import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createVectorizedStrings: Symbol("createVectorizedStrings"),
  domainEvent: vi.fn((name: string, payload: unknown) => ({ name, payload })),
  domainEventBus: {
    publish: vi.fn(),
  },
  executeCommand: vi.fn(),
  getDbHandle: vi.fn(),
  getVectorizationQueue: vi.fn(),
}));

vi.mock("@cat/domain", () => ({
  createVectorizedStrings: mocked.createVectorizedStrings,
  domainEvent: mocked.domainEvent,
  domainEventBus: mocked.domainEventBus,
  executeCommand: mocked.executeCommand,
  getDbHandle: mocked.getDbHandle,
}));

vi.mock("@cat/server-shared", () => ({
  getVectorizationQueue: mocked.getVectorizationQueue,
}));

import { createVectorizedStringOp } from "./create-vectorized-string.ts";

describe("createVectorizedStringOp", () => {
  beforeEach(() => {
    mocked.executeCommand.mockReset();
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

  it("enqueues vectorization when both service ids are available", async () => {
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
    mocked.getVectorizationQueue.mockReturnValue(queue);

    const result = await createVectorizedStringOp({
      data: [{ text: "Prompt", languageId: "en-US" }],
      vectorizerId: 101,
      vectorStorageId: 202,
    });

    expect(mocked.getVectorizationQueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith([
      expect.objectContaining({
        stringIds: [21],
        data: [{ text: "Prompt", languageId: "en-US" }],
        vectorizerId: 101,
        vectorStorageId: 202,
      }),
    ]);
    expect(mocked.domainEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "vectorization:enqueued",
        payload: expect.objectContaining({ stringIds: [21] }),
      }),
    );
    expect(result).toEqual({ stringIds: [21] });
  });
});
