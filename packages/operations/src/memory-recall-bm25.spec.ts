import { describe, expect, it } from "vitest";

import {
  BM25_DISABLED_REASON,
  buildMemoryRecallBm25Capabilities,
  compressBm25Score,
  MEMORY_RECALL_BM25_REGISTRY,
} from "./memory-recall-bm25";

describe("memory recall bm25 registry", () => {
  it("enables only en and zh-Hans", () => {
    expect(Object.keys(MEMORY_RECALL_BM25_REGISTRY)).toEqual(["en", "zh-Hans"]);
  });

  it("builds enabled and disabled capability entries from the full catalog", () => {
    expect(buildMemoryRecallBm25Capabilities(["en", "zh-Hans", "ja"])).toEqual([
      expect.objectContaining({ languageId: "en", enabled: true }),
      expect.objectContaining({ languageId: "zh-Hans", enabled: true }),
      expect.objectContaining({
        languageId: "ja",
        enabled: false,
        disabledReason: BM25_DISABLED_REASON,
      }),
    ]);
  });

  it("compresses raw scores monotonically into the 0 to 1 range", () => {
    expect(compressBm25Score(0, "bm25-ratio-k1-v1")).toBe(0);
    expect(compressBm25Score(1, "bm25-ratio-k1-v1")).toBeLessThan(
      compressBm25Score(2, "bm25-ratio-k1-v1"),
    );
    expect(compressBm25Score(10_000, "bm25-ratio-k1-v1")).toBeLessThan(1);
    expect(compressBm25Score(10_000, "bm25-ratio-k1-v1")).toBeGreaterThan(0);
    expect(
      compressBm25Score(Number.POSITIVE_INFINITY, "bm25-ratio-k1-v1"),
    ).toBe(0);
  });
});
