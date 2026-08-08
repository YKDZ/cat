import { PluginManager } from "@cat/plugin-core";
import { setupTestDB, TestPluginLoader, type TestDB } from "@cat/test-utils";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as z from "zod";

import {
  createDefaultGraphRuntime,
  type DefaultGraphRuntime,
} from "#/graph/index.ts";

import { defineGraph, defineNode } from "./index.ts";
import { runGraph, startGraph } from "./run-graph.ts";

let handlerStarted: (() => void) | undefined;
let releaseHandler: (() => void) | undefined;
let observedOwnershipFence: unknown;

const cancellationGraph = defineGraph({
  id: "structured-cancellation-test",
  input: z.object({}),
  output: z.object({}),
  nodes: {
    wait: defineNode({
      input: z.object({}),
      output: z.object({}),
      handler: async (_input, ctx) => {
        handlerStarted?.();
        await new Promise<void>((resolve) => {
          releaseHandler = resolve;
        });
        ctx.signal?.throwIfAborted();
        return {};
      },
    }),
  },
  edges: [],
  entry: "wait",
  exit: ["wait"],
});

const ownershipContextGraph = defineGraph({
  id: "supplied-ownership-context-test",
  input: z.object({}),
  output: z.object({}),
  nodes: {
    observe: defineNode({
      input: z.object({}),
      output: z.object({}),
      handler: async (_input, ctx) => {
        observedOwnershipFence = ctx.ownershipFence;
        return {};
      },
    }),
  },
  edges: [],
  entry: "observe",
  exit: ["observe"],
});

let db: TestDB;
let runtime: DefaultGraphRuntime;

beforeAll(async () => {
  db = await setupTestDB();
  PluginManager.clear();
  const pluginManager = PluginManager.get(
    "GLOBAL",
    "structured-cancellation-test",
    new TestPluginLoader(),
  );
  runtime = createDefaultGraphRuntime(db.client, pluginManager);
  runtime.graphRegistry.register(cancellationGraph.graphDefinition);
  runtime.graphRegistry.register(ownershipContextGraph.graphDefinition);
});

afterAll(async () => {
  await runtime.dispose();
  PluginManager.clear();
  await db.cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
  handlerStarted = undefined;
  releaseHandler = undefined;
  observedOwnershipFence = undefined;
});

describe("runGraph cancellation", () => {
  it("waits for the running handler before rejecting an aborted run", async () => {
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    handlerStarted = markStarted;
    const controller = new AbortController();
    const execution = runGraph(
      cancellationGraph,
      {},
      {
        signal: controller.signal,
      },
    );
    let settled = false;
    void execution.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await started;
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);

    releaseHandler?.();
    await expect(execution).rejects.toMatchObject({ name: "AbortError" });
    expect(settled).toBe(true);
  });

  it("observes an abort while scheduler.start is pending in runGraph", async () => {
    let markHandlerStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markHandlerStarted = resolve;
    });
    handlerStarted = markHandlerStarted;

    let releaseStart: (() => void) | undefined;
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const originalStart = runtime.scheduler.start.bind(runtime.scheduler);
    vi.spyOn(runtime.scheduler, "start").mockImplementationOnce(
      async (...args) => {
        const runId = await originalStart(...args);
        await startGate;
        return runId;
      },
    );

    const controller = new AbortController();
    const execution = runGraph(
      cancellationGraph,
      {},
      {
        signal: controller.signal,
      },
    );

    await started;
    controller.abort();
    releaseStart?.();
    releaseHandler?.();

    await expect(execution).rejects.toMatchObject({ name: "AbortError" });
  });

  it("observes an abort while scheduler.start is pending in startGraph", async () => {
    let markHandlerStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markHandlerStarted = resolve;
    });
    handlerStarted = markHandlerStarted;

    let releaseStart: (() => void) | undefined;
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const originalStart = runtime.scheduler.start.bind(runtime.scheduler);
    vi.spyOn(runtime.scheduler, "start").mockImplementationOnce(
      async (...args) => {
        const runId = await originalStart(...args);
        await startGate;
        return runId;
      },
    );

    const controller = new AbortController();
    const handlePromise = startGraph(
      cancellationGraph,
      {},
      {
        signal: controller.signal,
      },
    );

    await started;
    controller.abort();
    releaseStart?.();
    const handle = await handlePromise;
    releaseHandler?.();

    await expect(handle.complete).rejects.toMatchObject({ name: "AbortError" });
  });

  it("preserves a supplied parent ownership fence in a child run", async () => {
    const parentFence = {
      runId: "11111111-1111-4111-8111-111111111111",
      ownerId: "22222222-2222-4222-8222-222222222222",
      epoch: 3,
    };

    await runGraph(
      ownershipContextGraph,
      {},
      {
        ownershipFence: parentFence,
        assertRunOwnership: async () => undefined,
      },
    );

    expect(observedOwnershipFence).toEqual(parentFence);
  });
});
