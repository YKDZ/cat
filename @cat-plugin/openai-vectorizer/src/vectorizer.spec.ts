import { PluginServiceUnavailableError } from "@cat/plugin-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  embeddingsCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    public embeddings = {
      create: mocks.embeddingsCreate,
    };
  },
}));

import { Vectorizer } from "./vectorizer";

describe("OpenAI vectorizer", () => {
  beforeEach(() => {
    mocks.embeddingsCreate.mockReset();
  });

  it("marks placeholder configuration as unavailable and skips network calls", async () => {
    const vectorizer = new Vectorizer({
      apiKey: "dummy-key",
      baseURL: "http://localhost:11434/v1",
    });

    expect(vectorizer.getAvailability()).toMatchObject({
      available: false,
      reason: "missing-config",
    });
    expect(vectorizer.canVectorize()).toBe(false);
    await expect(
      vectorizer.vectorize({
        elements: [{ text: "hello", languageId: "en" }],
      }),
    ).rejects.toBeInstanceOf(PluginServiceUnavailableError);
    expect(mocks.embeddingsCreate).not.toHaveBeenCalled();
  });

  it("accepts explicit OpenAI-compatible base URLs without an api key", async () => {
    mocks.embeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });
    const vectorizer = new Vectorizer({
      baseURL: "http://localhost:8000/v1",
      "model-id": "demo-model",
    });

    expect(vectorizer.getAvailability()).toEqual({
      available: true,
      reason: "ok",
    });
    await expect(
      vectorizer.vectorize({
        elements: [{ text: "hello", languageId: "en" }],
      }),
    ).resolves.toEqual([
      [
        {
          meta: { modelId: "demo-model" },
          vector: [0.1, 0.2, 0.3],
        },
      ],
    ]);
    expect(mocks.embeddingsCreate).toHaveBeenCalledOnce();
  });
});
