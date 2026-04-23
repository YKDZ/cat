import type { RerankRequest, RerankResponse } from "@cat/shared/schema/rerank";

import { PluginManager } from "@cat/plugin-core";
import { RerankProvider } from "@cat/plugin-core";
import { describe, expect, it, vi } from "vitest";

import { orchestrateRerank } from "./orchestrator";

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

const makeRequest = (candidateIds: string[]): RerankRequest => ({
  trigger: "precision-ambiguity",
  surface: "term",
  queryText: "memory bank",
  band: { start: 0, end: candidateIds.length, reasons: [] },
  candidates: candidateIds.map((id, i) => ({
    candidateId: id,
    surface: "term",
    originalIndex: i,
    originalConfidence: 0.8 - i * 0.05,
    title: `term-${i}`,
    sourceText: `source ${i}`,
  })),
});

describe("orchestrateRerank", () => {
  it("returns unavailable when no provider is configured", async () => {
    const pluginManager = new PluginManager("GLOBAL", "");
    const request = makeRequest(["a", "b"]);
    const result = await orchestrateRerank({ request, pluginManager });
    expect(result.trace.outcome).toBe("unavailable");
    // Original order preserved
    expect(result.orderedCandidateIds).toEqual(["a", "b"]);
  });

  it("applies reranked order on valid response", async () => {
    const provider = new StubRerankProvider();
    provider.rerank.mockResolvedValue({
      scores: [
        { candidateId: "b", score: 0.9 },
        { candidateId: "a", score: 0.5 },
      ],
    });

    const pluginManager = new PluginManager("GLOBAL", "");
    // Inject service manually
    vi.spyOn(pluginManager, "getServices").mockReturnValue([
      {
        pluginId: "stub-plugin",
        type: "RERANK_PROVIDER" as const,
        id: "stub",
        dbId: 1,
        service: provider,
      },
    ]);

    const request = makeRequest(["a", "b"]);
    const result = await orchestrateRerank({ request, pluginManager });
    expect(result.trace.outcome).toBe("applied");
    // b scores higher
    expect(result.orderedCandidateIds).toEqual(["b", "a"]);
  });

  it("returns invalid-response when score count mismatches", async () => {
    const provider = new StubRerankProvider();
    provider.rerank.mockResolvedValue({
      scores: [{ candidateId: "a", score: 0.9 }], // missing b
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
    const request = makeRequest(["a", "b"]);
    const result = await orchestrateRerank({ request, pluginManager });
    expect(result.trace.outcome).toBe("invalid-response");
    expect(result.orderedCandidateIds).toEqual(["a", "b"]);
  });

  it("returns invalid-response for unknown candidateId in scores", async () => {
    const provider = new StubRerankProvider();
    provider.rerank.mockResolvedValue({
      scores: [
        { candidateId: "a", score: 0.9 },
        { candidateId: "UNKNOWN", score: 0.5 },
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
    const request = makeRequest(["a", "b"]);
    const result = await orchestrateRerank({ request, pluginManager });
    expect(result.trace.outcome).toBe("invalid-response");
  });

  it("returns invalid-response for duplicate candidateIds in scores", async () => {
    const provider = new StubRerankProvider();
    provider.rerank.mockResolvedValue({
      scores: [
        { candidateId: "a", score: 0.9 },
        { candidateId: "a", score: 0.5 }, // duplicate
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
    const request = makeRequest(["a", "b"]);
    const result = await orchestrateRerank({ request, pluginManager });
    expect(result.trace.outcome).toBe("invalid-response");
  });

  it("returns invalid-response for non-finite scores", async () => {
    const provider = new StubRerankProvider();
    provider.rerank.mockResolvedValue({
      scores: [
        { candidateId: "a", score: Number.NaN },
        { candidateId: "b", score: 0.5 },
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
    const request = makeRequest(["a", "b"]);
    const result = await orchestrateRerank({ request, pluginManager });
    expect(result.trace.outcome).toBe("invalid-response");
  });

  it("returns timeout when provider throws a timeout error", async () => {
    const provider = new StubRerankProvider();
    provider.rerank.mockRejectedValue(
      new Error("TEI rerank timed out after 3000ms"),
    );
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
    const request = makeRequest(["a", "b"]);
    const result = await orchestrateRerank({ request, pluginManager });
    expect(result.trace.outcome).toBe("timeout");
    expect(result.orderedCandidateIds).toEqual(["a", "b"]);
  });

  it("returns cancelled when abort signal is set", async () => {
    const provider = new StubRerankProvider();
    provider.rerank.mockRejectedValue(new Error("TEI rerank cancelled"));
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
    const controller = new AbortController();
    controller.abort();
    const request = makeRequest(["a", "b"]);
    const result = await orchestrateRerank({
      request,
      pluginManager,
      signal: controller.signal,
    });
    expect(result.trace.outcome).toBe("cancelled");
    expect(result.orderedCandidateIds).toEqual(["a", "b"]);
  });

  it("returns fail-closed on generic provider error", async () => {
    const provider = new StubRerankProvider();
    provider.rerank.mockRejectedValue(new Error("network error"));
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
    const request = makeRequest(["a", "b"]);
    const result = await orchestrateRerank({ request, pluginManager });
    expect(result.trace.outcome).toBe("fail-closed");
    expect(result.orderedCandidateIds).toEqual(["a", "b"]);
  });
});
