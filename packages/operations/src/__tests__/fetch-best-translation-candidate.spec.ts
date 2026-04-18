/**
 * Unit tests for fetchBestTranslationCandidateOp.
 *
 * Validates:
 * - Memory wins over advisor (always, regardless of confidence)
 * - Returns highest-confidence memory result when multiple exist
 * - Returns adaptedTranslation when available
 * - Falls back to advisor when memory is empty
 * - Returns null when both providers return nothing
 * - Silently suppresses individual provider failures
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAdviseOp: vi.fn(),
  collectMemoryRecallOp: vi.fn(),
}));

vi.mock("../fetch-advise", () => ({
  fetchAdviseOp: mocks.fetchAdviseOp,
}));

vi.mock("../collect-memory-recall", () => ({
  collectMemoryRecallOp: mocks.collectMemoryRecallOp,
}));

import { fetchBestTranslationCandidateOp } from "../fetch-best-translation-candidate";

const baseInput = {
  text: "Hello world",
  sourceLanguageId: "en",
  translationLanguageId: "zh-CN",
};

describe("fetchBestTranslationCandidateOp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("memory > advisor priority", () => {
    it("returns memory result when both providers return candidates", async () => {
      mocks.fetchAdviseOp.mockResolvedValue({
        suggestions: [{ translation: "advisor-text", confidence: 0.95 }],
      });
      mocks.collectMemoryRecallOp.mockResolvedValue([
        {
          translation: "memory-text",
          adaptedTranslation: null,
          confidence: 0.8,
          memoryId: "mem-uuid-1",
        },
      ]);

      const result = await fetchBestTranslationCandidateOp(baseInput);

      expect(result).toMatchObject({
        text: "memory-text",
        confidence: 0.8,
        source: "memory",
        memoryId: "mem-uuid-1",
      });
    });

    it("returns adaptedTranslation when it is set", async () => {
      mocks.fetchAdviseOp.mockResolvedValue({ suggestions: [] });
      mocks.collectMemoryRecallOp.mockResolvedValue([
        {
          translation: "raw-translation",
          adaptedTranslation: "adapted-text",
          confidence: 0.85,
          memoryId: "mem-uuid-2",
        },
      ]);

      const result = await fetchBestTranslationCandidateOp(baseInput);

      expect(result?.text).toBe("adapted-text");
      expect(result?.source).toBe("memory");
    });

    it("picks the highest-confidence memory entry when multiple are returned", async () => {
      mocks.fetchAdviseOp.mockResolvedValue({ suggestions: [] });
      mocks.collectMemoryRecallOp.mockResolvedValue([
        {
          translation: "low",
          adaptedTranslation: null,
          confidence: 0.7,
          memoryId: "m1",
        },
        {
          translation: "high",
          adaptedTranslation: null,
          confidence: 0.95,
          memoryId: "m2",
        },
        {
          translation: "mid",
          adaptedTranslation: null,
          confidence: 0.82,
          memoryId: "m3",
        },
      ]);

      const result = await fetchBestTranslationCandidateOp(baseInput);

      expect(result?.text).toBe("high");
      expect(result?.memoryId).toBe("m2");
    });
  });

  describe("advisor fallback", () => {
    it("returns advisor result when memory is empty", async () => {
      mocks.fetchAdviseOp.mockResolvedValue({
        suggestions: [{ translation: "advisor-text", confidence: 0.9 }],
      });
      mocks.collectMemoryRecallOp.mockResolvedValue([]);

      const result = await fetchBestTranslationCandidateOp(baseInput);

      expect(result).toMatchObject({
        text: "advisor-text",
        confidence: 0.9,
        source: "advisor",
      });
      expect(result?.memoryId).toBeUndefined();
    });
  });

  describe("null case", () => {
    it("returns null when both providers return empty results", async () => {
      mocks.fetchAdviseOp.mockResolvedValue({ suggestions: [] });
      mocks.collectMemoryRecallOp.mockResolvedValue([]);

      const result = await fetchBestTranslationCandidateOp(baseInput);

      expect(result).toBeNull();
    });
  });

  describe("failure suppression", () => {
    it("returns memory result when advisor throws", async () => {
      mocks.fetchAdviseOp.mockRejectedValue(new Error("advisor error"));
      mocks.collectMemoryRecallOp.mockResolvedValue([
        {
          translation: "memory-text",
          adaptedTranslation: null,
          confidence: 0.8,
          memoryId: "mem-uuid-3",
        },
      ]);

      const result = await fetchBestTranslationCandidateOp(baseInput);

      expect(result?.source).toBe("memory");
      expect(result?.text).toBe("memory-text");
    });

    it("returns advisor result when memory throws", async () => {
      mocks.fetchAdviseOp.mockResolvedValue({
        suggestions: [{ translation: "advisor-text", confidence: 0.9 }],
      });
      mocks.collectMemoryRecallOp.mockRejectedValue(new Error("memory error"));

      const result = await fetchBestTranslationCandidateOp(baseInput);

      expect(result?.source).toBe("advisor");
      expect(result?.text).toBe("advisor-text");
    });

    it("returns null when both providers throw", async () => {
      mocks.fetchAdviseOp.mockRejectedValue(new Error("advisor down"));
      mocks.collectMemoryRecallOp.mockRejectedValue(new Error("memory down"));

      const result = await fetchBestTranslationCandidateOp(baseInput);

      expect(result).toBeNull();
    });
  });
});
