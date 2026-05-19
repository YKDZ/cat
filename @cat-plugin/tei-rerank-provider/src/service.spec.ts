import type { RerankProviderCall } from "@cat/shared";

import { PluginServiceUnavailableError } from "@cat/plugin-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEIRerankProvider } from "./service";

const buildInput = (): RerankProviderCall => ({
  request: {
    trigger: "precision-ambiguity",
    surface: "memory",
    queryText: "save changes",
    band: { start: 0, end: 2, reasons: ["probe"] },
    candidates: [
      {
        candidateId: "a",
        surface: "memory",
        originalIndex: 0,
        originalConfidence: 0.5,
        title: "A",
        sourceText: "save changes",
        targetText: "保存更改",
      },
    ],
    timeoutMs: 500,
  },
});

describe("TEI rerank provider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks missing baseURL config as unavailable and avoids fetch", async () => {
    const provider = new TEIRerankProvider({ timeoutMs: 3000 });

    expect(provider.getAvailability()).toMatchObject({
      available: false,
      reason: "missing-config",
    });
    await expect(provider.rerank(buildInput())).rejects.toBeInstanceOf(
      PluginServiceUnavailableError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reranks candidates when configured", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ index: 0, score: 0.92 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new TEIRerankProvider({
      baseURL: "http://localhost:8080",
      "model-id": "bge-reranker-base",
      timeoutMs: 3000,
    });

    expect(provider.getAvailability()).toEqual({
      available: true,
      reason: "ok",
    });

    await expect(provider.rerank(buildInput())).resolves.toMatchObject({
      scores: [{ candidateId: "a", score: 0.92 }],
      metadata: {
        modelId: "bge-reranker-base",
        endpoint: "http://localhost:8080",
        status: "ok",
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
