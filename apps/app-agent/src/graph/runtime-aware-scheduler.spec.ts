import { LLMProvider } from "@cat/plugin-core";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod/v4";

import type { AgentEvent } from "@/graph/events";
import type {
  ResolvedGraphRuntimeContext,
  RuntimeResolutionService,
} from "@/runtime/runtime-resolver";

import { MemoryCheckpointer } from "@/graph/checkpointer";
import { InProcessEventBus } from "@/graph/event-bus";
import { createAgentEvent } from "@/graph/events";
import { LocalExecutorPool } from "@/graph/executor-pool";
import { ToolNodeExecutor } from "@/graph/executors";
import { GraphRegistry } from "@/graph/graph-registry";
import { NodeRegistry } from "@/graph/node-registry";
import { RuntimeAwareScheduler } from "@/graph/runtime-aware-scheduler";
import { Scheduler } from "@/graph/scheduler";
import { defineTool } from "@/tools";

class TestLLMProvider extends LLMProvider {
  getId = (): string => "test-llm";

  getModelName = (): string => "test-model";

  chat = async () => {
    return {
      content: "unused",
      toolCalls: [],
      usage: {
        promptTokens: 0,
        completionTokens: 0,
      },
      finishReason: "stop" as const,
    };
  };

  supportsStreaming = (): boolean => false;
}

const confirmationTool = defineTool({
  name: "dangerous_tool",
  description: "Needs explicit confirmation before running",
  parameters: z.object({
    value: z.string(),
  }),
  confirmationPolicy: "always_confirm",
  execute: async (args) => {
    return {
      echoed: args.value,
    };
  },
});

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  isReady: () => boolean;
};

const createDeferred = <T>(): Deferred<T> => {
  let ready = false;
  let storedResolve = (_value: T): void => {
    throw new Error("Deferred resolver not ready");
  };

  const promise = new Promise<T>((resolve) => {
    storedResolve = (value) => {
      resolve(value);
    };
    ready = true;
  });

  return {
    promise,
    resolve: (value) => {
      storedResolve(value);
    },
    isReady: () => ready,
  };
};

let slowToolDeferred = createDeferred<{ echoed: string }>();

const slowTool = defineTool({
  name: "slow_tool",
  description: "Resolves only after the test explicitly allows it",
  parameters: z.object({
    value: z.string(),
  }),
  confirmationPolicy: "auto_allow",
  execute: async (args) => {
    void args;
    return slowToolDeferred.promise;
  },
});

const finalizeTool = defineTool({
  name: "finalize_tool",
  description: "Writes the final result after resume",
  parameters: z.object({
    value: z.string(),
  }),
  confirmationPolicy: "auto_allow",
  execute: async (args) => {
    return {
      finished: args.value,
    };
  },
});

const confirmGraph = {
  id: "confirm-graph",
  version: "1.0.0",
  entry: "confirm",
  nodes: {
    confirm: {
      id: "confirm",
      type: "tool" as const,
      timeoutMs: 1_000,
      config: {
        toolNamePath: "confirm.toolName",
        argsPath: "confirm.args",
        resultPath: "confirm.result",
      },
    },
  },
  edges: [],
};

const pauseRaceGraph = {
  id: "pause-race-graph",
  version: "1.0.0",
  entry: "slow",
  nodes: {
    slow: {
      id: "slow",
      type: "tool" as const,
      timeoutMs: 1_000,
      config: {
        toolNamePath: "slow.toolName",
        argsPath: "slow.args",
        resultPath: "slow.result",
      },
    },
    finalize: {
      id: "finalize",
      type: "tool" as const,
      timeoutMs: 1_000,
      config: {
        toolNamePath: "finalize.toolName",
        argsPath: "finalize.args",
        resultPath: "finalize.result",
      },
    },
  },
  edges: [
    {
      from: "slow",
      to: "finalize",
    },
  ],
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const getPayloadRecord = (event: AgentEvent): Record<string, unknown> => {
  const payload = event.payload;
  if (!isRecord(payload)) {
    return {};
  }

  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    record[key] = value;
  }
  return record;
};

const createResolvedRuntime = (
  tools = [confirmationTool],
): ResolvedGraphRuntimeContext => {
  return {
    llmProvider: new TestLLMProvider(),
    tools,
    systemPrompt: "system prompt",
    runtimeRef: {
      sessionId: 1,
      agentDefinitionId: 2,
      userId: "user-1",
      llmProviderDbId: 3,
      toolNames: tools.map((tool) => tool.name),
      toolSnapshot: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: z.toJSONSchema(tool.parameters),
      })),
      promptStrategy: "persisted",
      persistedSystemPrompt: "system prompt",
    },
  };
};

const createRuntime = (params: {
  checkpointer: MemoryCheckpointer;
  resolver: RuntimeResolutionService;
  subscribeToRecoveryEvents?: boolean;
}) => {
  const eventBus = new InProcessEventBus();
  const executorPool = new LocalExecutorPool();
  const graphRegistry = new GraphRegistry();
  const nodeRegistry = new NodeRegistry();

  graphRegistry.register(confirmGraph);
  graphRegistry.register(pauseRaceGraph);
  nodeRegistry.register("tool", ToolNodeExecutor);

  const baseScheduler = new Scheduler({
    eventBus,
    checkpointer: params.checkpointer,
    executorPool,
    graphRegistry,
    nodeRegistry,
  });

  const scheduler = new RuntimeAwareScheduler(
    baseScheduler,
    params.resolver,
    params.subscribeToRecoveryEvents,
  );

  return {
    eventBus,
    checkpointer: params.checkpointer,
    scheduler,
  };
};

describe("RuntimeAwareScheduler", () => {
  it("persists runtimeRef and can recover a paused tool-confirm run after a restart-like recreation", async () => {
    const checkpointer = new MemoryCheckpointer();
    const resolvedRuntime = createResolvedRuntime();
    let resolveForRunCalls = 0;

    const resolver: RuntimeResolutionService = {
      resolveForSession: async () => resolvedRuntime,
      resolveForRun: async () => {
        resolveForRunCalls += 1;
        return resolvedRuntime;
      },
    };

    const runtime1 = createRuntime({
      checkpointer,
      resolver,
    });

    const runId = await runtime1.scheduler.start(
      "confirm-graph",
      {
        confirm: {
          toolName: confirmationTool.name,
          args: { value: "approved" },
        },
      },
      {
        sessionId: 1,
        resolvedRuntime,
      },
    );

    const confirmationEvent = await runtime1.eventBus.waitFor({
      type: "tool:confirm:required",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });
    await runtime1.eventBus.waitFor({
      type: "run:pause",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });

    const metadata = await checkpointer.loadRunMetadata(runId);
    expect(metadata?.metadata).toMatchObject({
      sessionId: 1,
      runtimeRef: {
        sessionId: 1,
        agentDefinitionId: 2,
        userId: "user-1",
      },
    });

    const payload = getPayloadRecord(confirmationEvent);
    const callId = Reflect.get(payload, "callId");
    expect(typeof callId).toBe("string");

    const runtime2 = createRuntime({
      checkpointer,
      resolver,
    });
    const runEndPromise = runtime2.eventBus.waitFor({
      type: "run:end",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });

    await runtime2.eventBus.publish(
      createAgentEvent({
        runId,
        nodeId: "confirm",
        type: "tool:confirm:response",
        timestamp: new Date().toISOString(),
        payload: {
          nodeId: "confirm",
          callId,
          decision: "allow_once",
        },
      }),
    );

    const runEndEvent = await runEndPromise;
    const runEndPayload = getPayloadRecord(runEndEvent);
    const blackboard = Reflect.get(runEndPayload, "blackboard");
    const confirmValue =
      typeof blackboard === "object" &&
      blackboard !== null &&
      !Array.isArray(blackboard)
        ? Reflect.get(blackboard, "confirm")
        : null;

    expect(resolveForRunCalls).toBeGreaterThanOrEqual(1);
    expect(confirmValue).toMatchObject({
      result: {
        echoed: "approved",
      },
    });
  });

  it("keeps late node:end progress while externally paused and resumes downstream nodes after recreation", async () => {
    slowToolDeferred = createDeferred<{ echoed: string }>();

    const checkpointer = new MemoryCheckpointer();
    const resolvedRuntime = createResolvedRuntime([slowTool, finalizeTool]);

    const resolver: RuntimeResolutionService = {
      resolveForSession: async () => resolvedRuntime,
      resolveForRun: async () => resolvedRuntime,
    };

    const runtime1 = createRuntime({
      checkpointer,
      resolver,
      subscribeToRecoveryEvents: false,
    });

    const runId = await runtime1.scheduler.start(
      "pause-race-graph",
      {
        slow: {
          toolName: slowTool.name,
          args: { value: "slow-done" },
        },
        finalize: {
          toolName: finalizeTool.name,
          args: { value: "all-done" },
        },
      },
      {
        sessionId: 1,
        resolvedRuntime,
      },
    );

    await vi.waitFor(
      () => {
        expect(slowToolDeferred.isReady()).toBe(true);
      },
      { timeout: 2_000, interval: 10 },
    );

    await runtime1.scheduler.pause(runId);

    const metadataAfterPause = await checkpointer.loadRunMetadata(runId);
    expect(metadataAfterPause?.status).toBe("paused");

    slowToolDeferred.resolve({ echoed: "slow-done" });

    await vi.waitFor(
      async () => {
        const metadata = await checkpointer.loadRunMetadata(runId);
        expect(metadata?.status).toBe("paused");
        expect(metadata?.metadata).toMatchObject({
          "__scheduler.pendingNodeIds": ["finalize"],
        });
      },
      { timeout: 2_000, interval: 10 },
    );

    const pausedMetadata = await checkpointer.loadRunMetadata(runId);
    expect(pausedMetadata?.metadata).toMatchObject({
      "__scheduler.pendingNodeIds": ["finalize"],
    });

    const runtime2 = createRuntime({
      checkpointer,
      resolver,
      subscribeToRecoveryEvents: false,
    });

    const runEndPromise = runtime2.eventBus.waitFor({
      type: "run:end",
      timeoutMs: 2_000,
      predicate: (event) => event.runId === runId,
    });

    await runtime2.scheduler.resume(runId);

    const runEndEvent = await runEndPromise;
    const runEndPayload = getPayloadRecord(runEndEvent);
    const blackboard = Reflect.get(runEndPayload, "blackboard");

    expect(blackboard).toMatchObject({
      slow: {
        result: {
          echoed: "slow-done",
        },
      },
      finalize: {
        result: {
          finished: "all-done",
        },
      },
    });
  });
});
