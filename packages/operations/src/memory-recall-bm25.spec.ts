import * as domain from "@cat/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BM25_DISABLED_BY_RUNTIME_REASON,
  BM25_DISABLED_REASON,
  buildMemoryRecallBm25Capabilities,
  collectBm25MemorySuggestionsOp,
  compressBm25Score,
  MEMORY_RECALL_BM25_REGISTRY,
} from "./memory-recall-bm25";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "__CAT_RUNTIME_STATE__");
  vi.restoreAllMocks();
});

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

  it("keeps supported languages enabled when runtime state has not been initialized", () => {
    expect(buildMemoryRecallBm25Capabilities(["en", "zh-Hans"])).toEqual([
      expect.objectContaining({
        languageId: "en",
        enabled: true,
        disabledReason: null,
      }),
      expect.objectContaining({
        languageId: "zh-Hans",
        enabled: true,
        disabledReason: null,
      }),
    ]);
  });

  it("disables bm25 capabilities when runtime search level is partial", () => {
    domain.initRuntimeState({
      profile: domain.resolveRuntimeProfile({ CAT_RUNTIME_PROFILE: "lite" }),
      database: {
        backend: "postgres-server",
        searchLevel: "partial-search-runtime",
        extensions: {
          vector: true,
          pg_trgm: true,
          rum: false,
          zhparser: false,
        },
        textSearchConfigs: { cat_zh_hans: false },
        functions: { rum_ts_score: false },
        disabledFeatures: [
          "rum-index-ranking",
          "zhparser-full-text",
          "bm25-memory-recall",
        ],
        warnings: [
          "database search capability degraded to partial-search-runtime",
        ],
      },
      initializedAt: new Date().toISOString(),
    });

    expect(buildMemoryRecallBm25Capabilities(["en"], ["en"])).toEqual([
      expect.objectContaining({
        languageId: "en",
        enabled: false,
        disabledReason: BM25_DISABLED_BY_RUNTIME_REASON,
      }),
    ]);
  });

  it("skips the bm25 query when runtime search is unavailable", async () => {
    domain.initRuntimeState({
      profile: domain.resolveRuntimeProfile({ CAT_RUNTIME_PROFILE: "lite" }),
      database: {
        backend: "postgres-server",
        searchLevel: "partial-search-runtime",
        extensions: {
          vector: true,
          pg_trgm: true,
          rum: false,
          zhparser: false,
        },
        textSearchConfigs: { cat_zh_hans: false },
        functions: { rum_ts_score: false },
        disabledFeatures: [
          "rum-index-ranking",
          "zhparser-full-text",
          "bm25-memory-recall",
        ],
        warnings: [
          "database search capability degraded to partial-search-runtime",
        ],
      },
      initializedAt: new Date().toISOString(),
    });
    const executeQuerySpy = vi.spyOn(domain, "executeQuery");

    const result = await collectBm25MemorySuggestionsOp({
      text: "hello",
      sourceLanguageId: "en",
      translationLanguageId: "zh-Hans",
      memoryIds: [],
      maxAmount: 5,
    });

    expect(result).toEqual([]);
    expect(executeQuerySpy).not.toHaveBeenCalled();
  });

  it("keeps unsupported languages on the rollout disabled reason", () => {
    domain.initRuntimeState({
      profile: domain.resolveRuntimeProfile({ CAT_RUNTIME_PROFILE: "lite" }),
      database: {
        backend: "postgres-server",
        searchLevel: "partial-search-runtime",
        extensions: {
          vector: true,
          pg_trgm: true,
          rum: false,
          zhparser: false,
        },
        textSearchConfigs: { cat_zh_hans: false },
        functions: { rum_ts_score: false },
        disabledFeatures: [
          "rum-index-ranking",
          "zhparser-full-text",
          "bm25-memory-recall",
        ],
        warnings: [
          "database search capability degraded to partial-search-runtime",
        ],
      },
      initializedAt: new Date().toISOString(),
    });

    expect(buildMemoryRecallBm25Capabilities(["ja"])).toEqual([
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
