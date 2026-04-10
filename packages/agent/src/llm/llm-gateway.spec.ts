import type {
  ChatCompletionRequest,
  LLMChunk,
  LLMProvider,
} from "@cat/plugin-core";

import { describe, expect, it, vi } from "vitest";

import { LLMGateway } from "./llm-gateway.ts";

function makeChunks(texts: string[]): LLMChunk[] {
  return texts.map((textDelta) => ({ type: "text_delta" as const, textDelta }));
}

function makeProvider(chunks: LLMChunk[]): LLMProvider {
  // oxlint-disable-next-line no-unsafe-type-assertion -- partial mock object for testing
  return {
    getId: () => "mock",
    getType: () => "LLM_PROVIDER" as const,
    getModelName: () => "mock-model",
    async *chat(_req: ChatCompletionRequest): AsyncIterable<LLMChunk> {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  } as unknown as LLMProvider;
}

async function collectChunks(
  iterable: AsyncIterable<LLMChunk>,
): Promise<LLMChunk[]> {
  const result: LLMChunk[] = [];
  for await (const chunk of iterable) {
    result.push(chunk);
  }
  return result;
}

const mockRequest: ChatCompletionRequest = {
  messages: [{ role: "user", content: "Hello" }],
};

describe("LLMGateway", () => {
  it("forwards chat() to the underlying provider", async () => {
    const chunks = makeChunks(["Hello", " world"]);
    const provider = makeProvider(chunks);

    const gateway = new LLMGateway({ provider });
    const result = await collectChunks(gateway.chat({ request: mockRequest }));

    expect(result).toEqual(chunks);
  });

  it("works without rate limiting (rateLimit=0)", async () => {
    const chunks = makeChunks(["response"]);
    const gateway = new LLMGateway({
      provider: makeProvider(chunks),
      rateLimit: 0,
    });

    const result = await collectChunks(gateway.chat({ request: mockRequest }));
    expect(result).toHaveLength(1);
    const first = result[0];
    expect(first?.type === "text_delta" && first.textDelta).toBe("response");
  });

  it("applies rate limiting via token bucket", async () => {
    vi.useFakeTimers();

    const chunks = makeChunks(["ok"]);
    const provider = makeProvider(chunks);

    // 1 token per second, burst of 1 — means after the first, we must wait
    const gateway = new LLMGateway({
      provider,
      rateLimit: 1,
      burstCapacity: 1,
    });

    // First call should succeed immediately
    const p1 = collectChunks(gateway.chat({ request: mockRequest }));
    vi.runAllTimers();
    await p1;

    // Second call blocks until token refills (~1s)
    let secondResolved = false;
    const p2 = collectChunks(gateway.chat({ request: mockRequest })).then(
      (r) => {
        secondResolved = true;
        return r;
      },
    );

    // Not resolved yet
    expect(secondResolved).toBe(false);

    // Advance 1 second to allow token refill
    vi.advanceTimersByTime(1100);
    await p2;
    expect(secondResolved).toBe(true);

    vi.useRealTimers();
  });

  it("respects priority ordering via queue", async () => {
    const order: string[] = [];
    // oxlint-disable-next-line no-unsafe-type-assertion -- partial mock object for testing
    const provider = {
      getId: () => "mock",
      getType: () => "LLM_PROVIDER" as const,
      getModelName: () => "mock-model",
      async *chat(req: ChatCompletionRequest): AsyncIterable<LLMChunk> {
        const label = req.messages[0]?.content ?? "";
        order.push(label);
        yield { type: "text_delta", textDelta: label } satisfies LLMChunk;
      },
    } as unknown as LLMProvider;

    // concurrency=1, rateLimit=0 so queing is the only bottleneck
    const gateway = new LLMGateway({ provider, concurrency: 1 });

    const makeReq = (label: string): ChatCompletionRequest => ({
      messages: [{ role: "user", content: label }],
    });

    // First request gets the slot immediately
    const p1 = collectChunks(
      gateway.chat({ request: makeReq("low"), priority: "LOW" }),
    );

    // These queue up while p1 is running (provider is async generator so the
    // release happens after the generator completes)
    const p2 = collectChunks(
      gateway.chat({ request: makeReq("normal"), priority: "NORMAL" }),
    );
    const p3 = collectChunks(
      gateway.chat({ request: makeReq("critical"), priority: "CRITICAL" }),
    );
    const p4 = collectChunks(
      gateway.chat({ request: makeReq("high"), priority: "HIGH" }),
    );

    await Promise.all([p1, p2, p3, p4]);

    // "low" ran first (it held the slot on enqueue); then CRITICAL, HIGH, NORMAL
    expect(order[0]).toBe("low");
    expect(order.slice(1)).toEqual(["critical", "high", "normal"]);
  });

  it("releases queue slot even when provider throws", async () => {
    // oxlint-disable-next-line no-unsafe-type-assertion -- partial mock object for testing
    const errorProvider = {
      getId: () => "mock",
      getType: () => "LLM_PROVIDER" as const,
      getModelName: () => "mock-model",
      // oxlint-disable-next-line require-yield -- throws before any value can be yielded
      async *chat(): AsyncIterable<LLMChunk> {
        throw new Error("provider error");
      },
    } as unknown as LLMProvider;

    const gateway = new LLMGateway({ provider: errorProvider, concurrency: 1 });

    // First call should throw
    const p1 = collectChunks(gateway.chat({ request: mockRequest }));
    await expect(p1).rejects.toThrow("provider error");

    // Second call should NOT hang — the slot was released in the finally block
    const p2 = collectChunks(
      gateway.chat({
        request: mockRequest,
        // Swap to working provider — gateway doesn't swap; test with same gateway
      }),
    );

    // p2 will also throw since same gateway uses errorProvider
    await expect(p2).rejects.toThrow("provider error");
  });
});
