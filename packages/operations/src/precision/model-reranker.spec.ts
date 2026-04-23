import type { AmbiguityEnvelope } from "@cat/shared/schema/precision-recall";
import type { RerankRequest, RerankResponse } from "@cat/shared/schema/rerank";

import { PluginManager, RerankProvider } from "@cat/plugin-core";
import { describe, expect, it, vi } from "vitest";

import type { RecallCandidate } from "./types";

import { applyModelReranker } from "./model-reranker";
import { candidateKey } from "./types";

// Minimal stub RerankProvider
class StubRerankProvider extends RerankProvider {
  getId() {
    return "stub";
  }
  getModelName() {
    return "stub-model";
  }
  rerank =
    vi.fn<(input: { request: RerankRequest }) => Promise<RerankResponse>>();
}

const makeCandidate = (
  conceptId: number,
  confidence: number,
  tier: "1" | "2" | "3" = "2",
): RecallCandidate => ({
  surface: "term",
  conceptId,
  glossaryId: "g",
  term: `term-${conceptId}`,
  translation: `tr-${conceptId}`,
  definition: null,
  confidence,
  tier,
  evidences: [{ channel: "exact", confidence }],
  rankingDecisions: [],
});

const makeEnvelope = (
  start: number,
  end: number,
  shouldInvokeModel = true,
): AmbiguityEnvelope => ({
  shouldInvokeModel,
  eligibleBand: { start, end, reasons: ["confidence-gap"] },
});

describe("applyModelReranker", () => {
  it("returns original order when baseline mode", async () => {
    const ranked = [
      makeCandidate(1, 0.91),
      makeCandidate(2, 0.83),
      makeCandidate(3, 0.82),
    ];
    const envelope = makeEnvelope(1, 3);
    const result = await applyModelReranker({
      ranked,
      queryText: "test",
      envelope,
      rerankMode: "baseline",
    });
    expect(result.map(candidateKey)).toEqual(["term:1", "term:2", "term:3"]);
    // All candidates get a skip note
    expect(
      result.every((c) =>
        c.rankingDecisions.some((d) => d.action === "model-reranker-skipped"),
      ),
    ).toBe(true);
  });

  it("returns original order when shouldInvokeModel=false", async () => {
    const ranked = [makeCandidate(1, 0.91), makeCandidate(2, 0.83)];
    const envelope = makeEnvelope(0, 2, false);
    const result = await applyModelReranker({
      ranked,
      queryText: "test",
      envelope,
    });
    expect(result.map(candidateKey)).toEqual(["term:1", "term:2"]);
  });

  it("reorders only the eligible band, preserving prefix and tail", async () => {
    const ranked = [
      makeCandidate(1, 0.91, "1"), // prefix — protected by clear Tier-1
      makeCandidate(2, 0.83),
      makeCandidate(3, 0.82),
      makeCandidate(4, 0.6, "3"), // tail
    ];
    const envelope = makeEnvelope(1, 3);

    const provider = new StubRerankProvider();
    // Provider says term:3 > term:2
    provider.rerank.mockResolvedValue({
      scores: [
        { candidateId: "term:2", score: 0.5 },
        { candidateId: "term:3", score: 0.9 },
      ],
    });

    const pluginManager = new PluginManager("GLOBAL", "");
    vi.spyOn(pluginManager, "getServices").mockReturnValue([
      {
        pluginId: "stub-plugin",
        type: "RERANK_PROVIDER" as const,
        id: "stub",
        dbId: 1,
        service: provider,
      },
    ]);

    const result = await applyModelReranker({
      ranked,
      queryText: "test",
      envelope,
      pluginManager,
    });

    expect(result.map(candidateKey)).toEqual([
      "term:1", // prefix unchanged
      "term:3", // swapped to position 1
      "term:2", // swapped to position 2
      "term:4", // tail unchanged
    ]);
  });

  it("falls back to original order on invalid response from provider", async () => {
    const ranked = [makeCandidate(1, 0.8), makeCandidate(2, 0.78)];
    const envelope = makeEnvelope(0, 2);

    const provider = new StubRerankProvider();
    // Returns only one score for two candidates
    provider.rerank.mockResolvedValue({
      scores: [{ candidateId: "term:1", score: 0.9 }],
    });

    const pluginManager = new PluginManager("GLOBAL", "");
    vi.spyOn(pluginManager, "getServices").mockReturnValue([
      {
        pluginId: "stub-plugin",
        type: "RERANK_PROVIDER" as const,
        id: "stub",
        dbId: 1,
        service: provider,
      },
    ]);

    const result = await applyModelReranker({
      ranked,
      queryText: "test",
      envelope,
      pluginManager,
    });

    // Original order preserved on invalid-response
    expect(result.map(candidateKey)).toEqual(["term:1", "term:2"]);
    expect(
      result.every((c) =>
        c.rankingDecisions.some(
          (d) => d.action === "model-reranker-invalid-response",
        ),
      ),
    ).toBe(true);
  });

  it("preserves tail order outside the band", async () => {
    const ranked = [
      makeCandidate(1, 0.9),
      makeCandidate(2, 0.85),
      makeCandidate(3, 0.5, "3"),
      makeCandidate(4, 0.45, "3"),
    ];
    const envelope = makeEnvelope(0, 2);

    const provider = new StubRerankProvider();
    provider.rerank.mockResolvedValue({
      scores: [
        { candidateId: "term:1", score: 0.5 },
        { candidateId: "term:2", score: 0.9 },
      ],
    });
    const pluginManager = new PluginManager("GLOBAL", "");
    vi.spyOn(pluginManager, "getServices").mockReturnValue([
      {
        pluginId: "stub-plugin",
        type: "RERANK_PROVIDER" as const,
        id: "stub",
        dbId: 1,
        service: provider,
      },
    ]);

    const result = await applyModelReranker({
      ranked,
      queryText: "test",
      envelope,
      pluginManager,
    });

    // Band is reordered, tail unchanged
    expect(result.map(candidateKey)).toEqual([
      "term:2",
      "term:1",
      "term:3",
      "term:4",
    ]);
  });

  it("returns unavailable trace when no provider configured", async () => {
    const ranked = [makeCandidate(1, 0.8), makeCandidate(2, 0.78)];
    const envelope = makeEnvelope(0, 2);
    const pluginManager = new PluginManager("GLOBAL", "");
    const result = await applyModelReranker({
      ranked,
      queryText: "test",
      envelope,
      pluginManager,
    });
    // Unavailable → note all with model-reranker-unavailable
    expect(
      result.every((c) =>
        c.rankingDecisions.some(
          (d) => d.action === "model-reranker-unavailable",
        ),
      ),
    ).toBe(true);
    expect(result.map(candidateKey)).toEqual(["term:1", "term:2"]);
  });
});
