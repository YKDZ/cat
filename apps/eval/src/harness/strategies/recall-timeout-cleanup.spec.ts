import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collectMemoryRecallOp: vi.fn(),
  collectTermRecallOp: vi.fn(),
  getMemoryRecallCandidates: vi.fn(),
  getTermRecallCandidates: vi.fn(),
}));

vi.mock("@cat/operations", () => mocks);

import { memoryRecallStrategy } from "./memory-recall.ts";
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
