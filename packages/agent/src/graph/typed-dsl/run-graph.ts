import type { PluginManager } from "@cat/plugin-core";
import type * as z from "zod/v4";

import assert from "node:assert";

import { getStoredGraphRuntime } from "@/graph/runtime-store";

import type { TypedGraphDefinition } from "./types";

export type RunGraphOptions = {
  signal?: AbortSignal;
  sessionId?: number;
  metadata?: Record<string, unknown> | null;
  /** Override the plugin manager from the global runtime */
  pluginManager?: PluginManager;
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
  const { scheduler, eventBus, checkpointer } = getStoredGraphRuntime();

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const parsedInput = graph.inputSchema.parse(input) as Record<string, unknown>;

  const runId = await scheduler.start(graph.id, parsedInput, {
    sessionId: options?.sessionId,
    metadata: options?.metadata,
    pluginManager: options?.pluginManager,
  });

  return new Promise<z.infer<TOutput>>((resolve, reject) => {
    const unsubEnd = eventBus.subscribe("run:end", async (event) => {
      if (event.runId !== runId) return;
      unsubEnd();

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const payload = event.payload as Record<string, unknown>;
      const status = payload["status"];

      if (status === "failed" || status === "cancelled") {
        reject(
          new Error(`Graph run ${runId} ended with status: ${String(status)}`),
        );
        return;
      }

      const snapshot = await checkpointer.loadSnapshot(runId);
      if (!snapshot) {
        reject(new Error(`No snapshot found for run ${runId}`));
        return;
      }

      try {
        resolve(graph.extractResult(snapshot));
      } catch (err) {
        assert(err instanceof Error, "Captured object is not an Error");
        reject(err);
      }
    });

    options?.signal?.addEventListener("abort", () => {
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
  const { scheduler, eventBus, checkpointer } = getStoredGraphRuntime();

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const parsedInput = graph.inputSchema.parse(input) as Record<string, unknown>;

  const runId = await scheduler.start(graph.id, parsedInput, {
    sessionId: options?.sessionId,
    metadata: options?.metadata,
    pluginManager: options?.pluginManager,
  });

  const complete = new Promise<z.infer<TOutput>>((resolve, reject) => {
    const unsubEnd = eventBus.subscribe("run:end", async (event) => {
      if (event.runId !== runId) return;
      unsubEnd();

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const payload = event.payload as Record<string, unknown>;
      const status = payload["status"];

      if (status === "failed" || status === "cancelled") {
        reject(
          new Error(`Graph run ${runId} ended with status: ${String(status)}`),
        );
        return;
      }

      const snapshot = await checkpointer.loadSnapshot(runId);
      if (!snapshot) {
        reject(new Error(`No snapshot found for run ${runId}`));
        return;
      }

      try {
        resolve(graph.extractResult(snapshot));
      } catch (err) {
        assert(err instanceof Error, "Captured object is not an Error");
        reject(err);
      }
    });

    options?.signal?.addEventListener("abort", () => {
      unsubEnd();
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

  return { runId, complete };
};
