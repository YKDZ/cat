import type {
  ChatCompletionRequest,
  LLMChunk,
  LLMProvider,
} from "@cat/plugin-core";

import { describe, expect, it, vi } from "vitest";

import { LLMGateway } from "../../llm/llm-gateway.ts";
import { createNoopAgentLogger } from "../../observability/agent-logger.ts";
import { PromptEngine } from "../../prompt/prompt-engine.ts";
import { ToolRegistry } from "../../tool/tool-registry.ts";
import { runReasoningNode } from "./reasoning-node.ts";

const createStream = (chunks: LLMChunk[]): AsyncIterable<LLMChunk> => ({
  [Symbol.asyncIterator]: () => {
    let index = 0;

    return {
      next: async () => {
        const value = chunks[index];
        index += 1;

        if (!value) {
          return { done: true, value: undefined };
        }

        return { done: false, value };
      },
    };
  },
});

const createGateway = (capture: {
  lastRequest: ChatCompletionRequest | null;
}): LLMGateway => {
  const provider: LLMProvider = {
    getId: () => "test-provider",
    getType: () => "LLM_PROVIDER",
    getModelName: () => "test-model",
    chat: (request: ChatCompletionRequest): AsyncIterable<LLMChunk> => {
      capture.lastRequest = request;

      return createStream([
        { type: "text_delta", textDelta: "done" },
        { type: "usage", usage: { promptTokens: 10, completionTokens: 5 } },
        { type: "finish", finishReason: "stop" },
      ]);
    },
  };

  return new LLMGateway({ provider });
};

const createContext = (input?: { promptEngine?: PromptEngine }) => {
  const capture = { lastRequest: null as ChatCompletionRequest | null };
  const promptEngine = input?.promptEngine ?? new PromptEngine();

  return {
    capture,
    ctx: {
      sessionId: "session-1",
      runId: "run-1",
      agentId: "translator",
      projectId: "project-1",
      sessionMetadata: {
        projectId: "project-1",
        projectName: "CAT",
      },
      promptVariables: {
        projectId: "project-1",
        projectName: "CAT",
        maxTurns: "50",
        documentId: "",
        elementId: "",
        languageId: "zh-CN",
        sourceLanguageId: "en-US",
      },
      llmGateway: createGateway(capture),
      toolRegistry: new ToolRegistry(),
      promptEngine,
      constraints: {
        maxSteps: 50,
        maxConcurrentToolCalls: 3,
        timeoutMs: 600_000,
        maxCorrectionAttempts: 2,
      },
      startedAt: new Date("2026-04-11T00:00:00.000Z"),
      logger: createNoopAgentLogger(),
      vcsMode: "direct" as const,
      permissionChecker: async () => true,
    },
  };
};

describe("runReasoningNode", () => {
  it("passes prompt variables to PromptEngine.buildPrompt", async () => {
    const promptEngine = new PromptEngine();
    const buildPromptSpy = vi.spyOn(promptEngine, "buildPrompt");
    const { ctx } = createContext({ promptEngine });

    await runReasoningNode(
      { messages: [{ role: "user", content: "hello" }] },
      ctx,
      {
        content: "Project {{projectName}} / Turns {{maxTurns}}",
        metadata: { tools: [], llm: { temperature: 0.3, maxTokens: 128 } },
      },
    );

    expect(buildPromptSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variables: ctx.promptVariables }),
    );
  });

  it("interpolates template variables before sending the prompt to the LLM", async () => {
    const { ctx, capture } = createContext();

    await runReasoningNode(
      { messages: [{ role: "user", content: "请开始翻译" }] },
      ctx,
      {
        content: "项目：{{projectName}}；最大轮数：{{maxTurns}}。",
        metadata: { tools: [], llm: { temperature: 0.3, maxTokens: 128 } },
      },
    );

    const systemMessage = capture.lastRequest?.messages[0];

    expect(systemMessage?.content).toContain("项目：CAT；最大轮数：50。");
    expect(systemMessage?.content).not.toContain("{{projectName}}");
    expect(systemMessage?.content).not.toContain("{{maxTurns}}");
  });
});
