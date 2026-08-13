import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectMemoryRecallOp: vi.fn(),
  collectTermRecallOp: vi.fn(),
  getMemoryRecallCandidates: vi.fn(),
  getTermRecallCandidates: vi.fn(),
}));

vi.mock("@cat/operations", () => mocks);

import { memoryRecallStrategy } from "./memory-recall.ts";
import { DEFAULT_RECALL_OPERATION_TIMEOUT_MS } from "./recall-timeout.ts";
import { termRecallStrategy } from "./term-recall.ts";

const scenario = {
  scorers: [],
  "test-set": "cases",
  type: "memory-recall",
} as never;

const context = {
  agentDefinitionId: undefined,
  contentNodeId: undefined,
  db: {},
  glossaryId: undefined,
  memoryId: undefined,
  pluginManager: {},
  projectId: "project",
  refs: {},
  userId: "user",
} as never;

afterEach(() => {
  vi.useRealTimers();
  mocks.collectMemoryRecallOp.mockReset();
  mocks.collectTermRecallOp.mockReset();
});

describe("recall strategy timeout cleanup", () => {
  it("aborts memory recall at its default operation timeout", async () => {
    vi.useFakeTimers();
    mocks.collectMemoryRecallOp.mockImplementationOnce(
      async (_input, { signal }: { signal?: AbortSignal }) =>
        await new Promise<never>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    const execution = memoryRecallStrategy.execute(
      scenario,
      {
        cases: [
          {
            expectedMemories: [],
            id: "memory-timeout-case",
            inputText: "source",
            negativeMemories: [],
            sourceLanguage: "en",
            targetLanguage: "zh",
          },
        ],
        name: "memory cases",
      },
      context,
    );
    await vi.advanceTimersByTimeAsync(DEFAULT_RECALL_OPERATION_TIMEOUT_MS - 1);
    expect(mocks.collectMemoryRecallOp).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(execution).resolves.toMatchObject({
      cases: [{ status: "timeout" }],
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts term recall at its default operation timeout", async () => {
    vi.useFakeTimers();
    mocks.collectTermRecallOp.mockImplementationOnce(
      async (_input, { signal }: { signal?: AbortSignal }) =>
        await new Promise<never>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    const execution = termRecallStrategy.execute(
      scenario,
      {
        cases: [
          {
            expectedTerms: [],
            id: "term-timeout-case",
            inputText: "term",
            negativeTerms: [],
            sourceLanguage: "en",
            targetLanguage: "zh",
          },
        ],
        name: "term cases",
      },
      context,
    );
    await vi.advanceTimersByTimeAsync(DEFAULT_RECALL_OPERATION_TIMEOUT_MS - 1);
    expect(mocks.collectTermRecallOp).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(execution).resolves.toMatchObject({
      cases: [{ status: "timeout" }],
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the memory recall timeout after an operation error", async () => {
    vi.useFakeTimers();
    mocks.collectMemoryRecallOp.mockRejectedValueOnce(new Error("failed"));

    await expect(
      memoryRecallStrategy.execute(
        scenario,
        {
          cases: [
            {
              expectedMemories: [
                {
                  expectedSource: "source",
                  expectedTranslation: "translation",
                  memoryItemRef: "memory",
                  requiredChannels: [],
                  requiredVariantTypes: [],
                },
              ],
              id: "memory-case",
              inputText: "source",
              negativeMemories: [],
              sourceLanguage: "en",
              targetLanguage: "zh",
            },
          ],
          name: "memory cases",
        },
        context,
      ),
    ).resolves.toMatchObject({ cases: [{ status: "error" }] });

    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the term recall timeout after an operation error", async () => {
    vi.useFakeTimers();
    mocks.collectTermRecallOp.mockRejectedValueOnce(new Error("failed"));

    await expect(
      termRecallStrategy.execute(
        scenario,
        {
          cases: [
            {
              expectedTerms: [
                {
                  conceptRef: "concept",
                  requiredChannels: [],
                  term: "term",
                  translation: "translation",
                },
              ],
              id: "term-case",
              inputText: "term",
              negativeTerms: [],
              sourceLanguage: "en",
              targetLanguage: "zh",
            },
          ],
          name: "term cases",
        },
        context,
      ),
    ).resolves.toMatchObject({ cases: [{ status: "error" }] });

    expect(vi.getTimerCount()).toBe(0);
  });
});
