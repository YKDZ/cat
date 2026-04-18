import type { PluginManager } from "@cat/plugin-core";
import type { JSONObject } from "@cat/shared/schema/json";
import type { VCSContext, VCSMiddleware } from "@cat/vcs";
import type * as z from "zod";

import assert from "node:assert";

import type { BlackboardSnapshot } from "@/graph/types";

import { getStoredGraphRuntime } from "@/graph/runtime-store";

import type { TypedGraphDefinition } from "./types";

export type RunGraphOptions = {
  signal?: AbortSignal;
  sessionId?: number;
  metadata?: JSONObject | null;
  /** Override the plugin manager from the global runtime */
  pluginManager?: PluginManager;
  /** @zh 可选的 VCS 上下文，用于 Direct 模式审计 @en Optional VCS context for Direct mode audit */
  vcsContext?: VCSContext;
  /** @zh 可选的 VCS 中间件实例 @en Optional VCS middleware instance */
  vcsMiddleware?: VCSMiddleware;
};

/**
 * Starts a typed graph as a new run and awaits completion.
 *
 * Uses the global runtime (scheduler, eventBus, checkpointer) initialised by
 * `createDefaultGraphRuntime`. The `pluginManager` is sourced from the global
 * runtime unless overridden via `options.pluginManager`.
 */
export const runGraph = async <
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
>(
  graph: TypedGraphDefinition<TInput, TOutput>,
  input: z.input<TInput>,
  options?: RunGraphOptions,
): Promise<z.infer<TOutput>> => {
  const { scheduler, eventBus } = getStoredGraphRuntime();

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const parsedInput = graph.inputSchema.parse(input) as Record<string, unknown>;

  const runId = await scheduler.start(graph.id, parsedInput, {
    sessionId: options?.sessionId,
    metadata: options?.metadata,
    pluginManager: options?.pluginManager,
    vcsContext: options?.vcsContext,
    vcsMiddleware: options?.vcsMiddleware,
  });

  return new Promise<z.infer<TOutput>>((resolve, reject) => {
    let lastNodeError: Error | null = null;

    const unsubError = eventBus.subscribe("run:error", (event) => {
      if (event.runId !== runId) return;
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const payload = event.payload as Record<string, unknown>;
      const msg =
        typeof payload["error"] === "string" ? payload["error"] : undefined;
      lastNodeError = new Error(msg ?? "Unknown graph node error");
    });

    const unsubEnd = eventBus.subscribe("run:end", (event) => {
      if (event.runId !== runId) return;
      unsubError();
      unsubEnd();

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const payload = event.payload as Record<string, unknown>;
      const status = payload["status"];

      if (status === "failed" || status === "cancelled") {
        reject(
          lastNodeError ??
            new Error(
              `Graph run ${runId} ended with status: ${String(status)}`,
            ),
        );
        return;
      }

      // Extract result directly from the run:end payload blackboard data,
      // avoiding a DB round-trip and potential saveSnapshot race conditions.
      try {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const blackboardData = payload["blackboard"] as Record<string, unknown>;
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const snapshot = {
          data: blackboardData,
        } as unknown as BlackboardSnapshot;
        resolve(graph.extractResult(snapshot));
      } catch (err) {
        assert(err instanceof Error, "Captured object is not an Error");
        reject(err);
      }
    });

    options?.signal?.addEventListener("abort", () => {
      unsubError();
      unsubEnd();
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
};

export type GraphRunHandle<TOutput> = {
  /** The run ID of the started graph, usable for event filtering. */
  runId: string;
  /** Resolves with the graph output when the run completes. */
  complete: Promise<TOutput>;
};

/**
 * Starts a typed graph run and returns a handle containing the `runId`
 * and a `complete` promise.  Useful when the caller needs the `runId`
 * upfront (e.g. to filter graph-emitted events before the run finishes).
 */
export const startGraph = async <
  TInput extends z.ZodType,
  TOutput extends z.ZodType,
>(
  graph: TypedGraphDefinition<TInput, TOutput>,
  input: z.input<TInput>,
  options?: RunGraphOptions,
): Promise<GraphRunHandle<z.infer<TOutput>>> => {
  const { scheduler, eventBus } = getStoredGraphRuntime();

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const parsedInput = graph.inputSchema.parse(input) as Record<string, unknown>;

  const runId = await scheduler.start(graph.id, parsedInput, {
    sessionId: options?.sessionId,
    metadata: options?.metadata,
    pluginManager: options?.pluginManager,
    vcsContext: options?.vcsContext,
    vcsMiddleware: options?.vcsMiddleware,
  });

  const complete = new Promise<z.infer<TOutput>>((resolve, reject) => {
    let lastNodeError: Error | null = null;

    const unsubError = eventBus.subscribe("run:error", (event) => {
      if (event.runId !== runId) return;
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const payload = event.payload as Record<string, unknown>;
      const msg =
        typeof payload["error"] === "string" ? payload["error"] : undefined;
      lastNodeError = new Error(msg ?? "Unknown graph node error");
    });

    const unsubEnd = eventBus.subscribe("run:end", (event) => {
      if (event.runId !== runId) return;
      unsubError();
      unsubEnd();

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const payload = event.payload as Record<string, unknown>;
      const status = payload["status"];

      if (status === "failed" || status === "cancelled") {
        reject(
          lastNodeError ??
            new Error(
              `Graph run ${runId} ended with status: ${String(status)}`,
            ),
        );
        return;
      }

      // Extract result directly from the run:end payload blackboard data,
      // avoiding a DB round-trip and potential saveSnapshot race conditions.
      try {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const blackboardData = payload["blackboard"] as Record<string, unknown>;
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const snapshot = {
          data: blackboardData,
        } as unknown as BlackboardSnapshot;
        resolve(graph.extractResult(snapshot));
      } catch (err) {
        assert(err instanceof Error, "Captured object is not an Error");
        reject(err);
      }
    });

    options?.signal?.addEventListener("abort", () => {
      unsubError();
      unsubEnd();
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

  return { runId, complete };
};
