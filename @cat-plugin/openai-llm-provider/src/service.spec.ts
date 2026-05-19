import { PluginServiceUnavailableError } from "@cat/plugin-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chatCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    public chat = {
      completions: {
        create: mocks.chatCreate,
      },
    };
  },
  Stream: class {},
}));

import { OpenAILLMProvider } from "./service";

async function* createStream() {
  yield {
    choices: [{ delta: { content: "OK" }, finish_reason: null }],
  };
  yield {
    choices: [{ delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  };
}

describe("OpenAI LLM provider", () => {
  beforeEach(() => {
    mocks.chatCreate.mockReset();
  });

  it("reports missing config as unavailable and yields a structured error", async () => {
    const provider = new OpenAILLMProvider({ model: "gpt-4o" });
    const chunks = [];

    expect(provider.getAvailability()).toMatchObject({
      available: false,
      reason: "missing-config",
    });

    for await (const chunk of provider.chat({
      messages: [{ role: "user", content: "hello" }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.type).toBe("error");
    if (chunks[0]?.type !== "error") {
      throw new Error("Expected the first chunk to be an error result");
    }
    expect(chunks[0].error).toBeInstanceOf(PluginServiceUnavailableError);
    expect(mocks.chatCreate).not.toHaveBeenCalled();
  });

  it("streams responses when an explicit compatible baseURL is configured", async () => {
    mocks.chatCreate.mockResolvedValue(createStream());
    const provider = new OpenAILLMProvider({
      baseURL: "http://localhost:8000/v1",
      model: "demo-model",
    });
    const chunks = [];

    expect(provider.getAvailability()).toEqual({
      available: true,
      reason: "ok",
    });

    for await (const chunk of provider.chat({
      messages: [{ role: "user", content: "hello" }],
      maxTokens: 8,
    })) {
      chunks.push(chunk);
    }

    expect(mocks.chatCreate).toHaveBeenCalledOnce();
    expect(chunks.some((chunk) => chunk.type === "text_delta")).toBe(true);
    expect(chunks.some((chunk) => chunk.type === "finish")).toBe(true);
  });
});
