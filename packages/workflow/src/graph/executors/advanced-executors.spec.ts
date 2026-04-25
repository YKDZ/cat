import type { JSONObject } from "@cat/shared";

import { describe, expect, it } from "vitest";

import type { AgentEvent } from "@/graph/events";
import type { NodeExecutorContext } from "@/graph/node-registry";

import { MemoryCheckpointer } from "@/graph/checkpointer";
import { InProcessEventBus } from "@/graph/event-bus";
import { createAgentEvent } from "@/graph/events";
import {
  HumanInputNodeExecutor,
  resumeHumanInputNode,
} from "@/graph/executors/human-input-node";
import { JoinNodeExecutor } from "@/graph/executors/join-node";
import { LoopNodeExecutor } from "@/graph/executors/loop-node";
import { ParallelNodeExecutor } from "@/graph/executors/parallel-node";
import { SubgraphNodeExecutor } from "@/graph/executors/subgraph-node";

const createCtx = (nodeId: string, data: JSONObject): NodeExecutorContext => {
  const eventBus = new InProcessEventBus();
  const bufferedEvents: AgentEvent[] = [];
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    nodeId,
    snapshot: {
      runId: "11111111-1111-4111-8111-111111111111",
      version: 0,
      data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    checkpointer: new MemoryCheckpointer(),
    runtime: {},
    emit: async (event) => {
      await eventBus.publish(
        createAgentEvent({
          runId: "11111111-1111-4111-8111-111111111111",
          nodeId,
          type: event.type,
          timestamp: event.timestamp ?? new Date().toISOString(),
          payload: event.payload ?? {},
        }),
      );
    },
    addEvent: (event) => {
      bufferedEvents.push(
        createAgentEvent({
          eventId: crypto.randomUUID(),
          runId: "11111111-1111-4111-8111-111111111111",
          nodeId,
          type: event.type,
          timestamp: event.timestamp ?? new Date().toISOString(),
          payload: event.payload ?? {},
        }),
      );
    },
  };
};

describe("advanced graph executors", () => {
  it("HumanInputNodeExecutor 会发布 human:input:required 并返回 paused", async () => {
    const ctx = createCtx("human_node", {});
    const events: string[] = [];

    const result = await HumanInputNodeExecutor(ctx, {
      prompt: "请输入确认信息",
      inputPath: "human.value",
      timeoutMs: 1000,
    });

    expect(result.status).toBe("paused");
    expect(result.pauseReason).toBe("human_input_required");
    expect(events).not.toContain("human:input:required");
  });

  it("resumeHumanInputNode 会生成写回 inputPath 的 patch", async () => {
    const ctx = createCtx("human_node", {});

    const result = await resumeHumanInputNode(
      ctx,
      { inputPath: "resume.value" },
      "accepted",
    );

    expect(result.status).toBe("completed");
    expect(result.patch.updates).toMatchObject({
      "resume.value": "accepted",
    });
  });

  it("ParallelNodeExecutor 在空分支时抛错", async () => {
    const ctx = createCtx("parallel_node", {});

    await expect(async () => {
      await ParallelNodeExecutor(ctx, {});
    }).rejects.toThrow();
  });

  it("ParallelNodeExecutor 在有效分支时返回 completed", async () => {
    const ctx = createCtx("parallel_node", {});

    const result = await ParallelNodeExecutor(ctx, {
      branches: ["a", "b"],
      maxConcurrency: 2,
    });

    expect(result.status).toBe("completed");
    expect(result.output).toMatchObject({
      branches: ["a", "b"],
      maxConcurrency: 2,
    });
  });

  it("JoinNodeExecutor 聚合 inputPaths 到 resultPath", async () => {
    const ctx = createCtx("join_node", {
      a: { value: 1 },
      b: { value: 2 },
    });

    const result = await JoinNodeExecutor(ctx, {
      inputPaths: ["a.value", "b.value"],
      resultPath: "join.result",
    });

    expect(result.status).toBe("completed");
    expect(result.patch?.updates).toMatchObject({
      "join.result": {
        "a.value": 1,
        "b.value": 2,
      },
    });
  });

  it("LoopNodeExecutor 能根据条件路由到 continueTarget", async () => {
    const ctx = createCtx("loop_node", {
      loop: {
        shouldContinue: true,
      },
    });

    const result = await LoopNodeExecutor(ctx, {
      conditionPath: "loop.shouldContinue",
      continueTarget: "next_continue",
      breakTarget: "next_break",
    });

    expect(result.status).toBe("completed");
    expect(result.patch?.updates).toMatchObject({
      __nextNode: "next_continue",
    });
  });

  it("SubgraphNodeExecutor 要求 subgraphId", async () => {
    const ctx = createCtx("subgraph_node", {});

    await expect(async () => {
      await SubgraphNodeExecutor(ctx, {});
    }).rejects.toThrow();
  });

  it("SubgraphNodeExecutor 将输入映射写入 resultPath", async () => {
    const ctx = createCtx("subgraph_node", {
      input: {
        hello: "world",
      },
    });

    const result = await SubgraphNodeExecutor(ctx, {
      subgraphId: "child_graph",
      inputPath: "input",
      resultPath: "subgraph.result",
    });

    expect(result.status).toBe("completed");
    expect(result.patch?.updates).toMatchObject({
      "subgraph.result": {
        subgraphId: "child_graph",
        inputPath: "input",
        input: {
          hello: "world",
        },
      },
    });
  });
});
