import assert from "node:assert";

import type { PluginManager } from "@cat/plugin-core";
import type { JSONObject } from "@cat/shared";
import { JSONObjectSchema } from "@cat/shared";
import type { VCSContext, VCSMiddleware } from "@cat/vcs";
import type * as z from "zod";

import type { RunOwnershipFence } from "#/graph/checkpointer/types.ts";
import { getStoredGraphRuntime } from "#/graph/runtime-store.ts";

import type { TypedGraphDefinition } from "./types.ts";

export type RunGraphOptions = {
  signal?: AbortSignal | undefined;
  sessionId?: number | undefined;
  metadata?: JSONObject | null | undefined;
  /** Override the plugin manager from the global runtime */
  pluginManager?: PluginManager | undefined;
  /** Optional VCS context for Direct mode audit */
  vcsContext?: VCSContext | undefined;
  /** Optional VCS middleware instance */
  vcsMiddleware?: VCSMiddleware | undefined;
  ownershipFence?: RunOwnershipFence | null | undefined;
  assertRunOwnership?: (() => Promise<void>) | undefined;
};

/**
 * Starts a typed graph as a new run and awaits completion.
 *
 * Uses the global runtime (scheduler, eventBus, checkpointer) initialised by
 * `createDefaultGraphRuntime`. The `pluginManager` is sourced from the global
 * runtime unless overridden via `options.pluginManager`.
 */
export const runGraph = async <
  TInput extends z.ZodObject,
  TOutput extends z.ZodObject,
>(
  graph: TypedGraphDefinition<TInput, TOutput>,
  input: z.input<TInput>,
  options?: RunGraphOptions,
): Promise<z.infer<TOutput>> => {
  const { scheduler, eventBus } = getStoredGraphRuntime();
  options?.signal?.throwIfAborted();

  const parsedInput = JSONObjectSchema.parse(graph.inputSchema.parse(input));

  const runId = await scheduler.start(graph.id, parsedInput, {
    sessionId: options?.sessionId,
    metadata: options?.metadata,
    pluginManager: options?.pluginManager,
    vcsContext: options?.vcsContext,
    vcsMiddleware: options?.vcsMiddleware,
    ...(options?.ownershipFence === undefined
      ? {}
      : { ownershipFence: options.ownershipFence }),
    ...(options?.assertRunOwnership === undefined
      ? {}
      : { assertRunOwnership: options.assertRunOwnership }),
  });

  return new Promise<z.infer<TOutput>>((resolve, reject) => {
    let lastNodeError: Error | null = null;
    let abortRequested = false;

    const unsubError = eventBus.subscribe("run:error", (event) => {
      if (event.runId !== runId) return;
      const payload = event.payload;
      const msg =
        typeof payload["error"] === "string" ? payload["error"] : undefined;
      lastNodeError = Object.assign(
        new Error(msg ?? "Unknown graph node error"),
        payload.operationFailure
          ? { operationFailure: payload.operationFailure }
          : {},
      );
    });

    const unsubEnd = eventBus.subscribe("run:end", (event) => {
      if (event.runId !== runId) return;
      unsubError();
      unsubEnd();
      options?.signal?.removeEventListener("abort", handleAbort);

      const payload = event.payload;
      const status = payload["status"];

      if (abortRequested) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      if (status === "failed" || status === "cancelled") {
        reject(
          lastNodeError ??
            new Error(`Graph run ${runId} ended with status: ${status}`),
        );
        return;
      }

      // Extract result directly from the run:end payload blackboard data,
      // avoiding a DB round-trip and potential saveSnapshot race conditions.
      try {
        const blackboardData = JSONObjectSchema.parse(payload["blackboard"]);
        resolve(
          graph.extractResult({
            data: blackboardData,
          }),
        );
      } catch (err) {
        assert(err instanceof Error, "Captured object is not an Error");
        reject(err);
      }
    });

    const handleAbort = (): void => {
      abortRequested = true;
      void scheduler.cancel(runId).catch(() => undefined);
    };
    options?.signal?.addEventListener("abort", handleAbort, { once: true });
    if (options?.signal?.aborted) handleAbort();
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
  TInput extends z.ZodObject,
  TOutput extends z.ZodObject,
>(
  graph: TypedGraphDefinition<TInput, TOutput>,
  input: z.input<TInput>,
  options?: RunGraphOptions,
): Promise<GraphRunHandle<z.infer<TOutput>>> => {
  const { scheduler, eventBus } = getStoredGraphRuntime();
  options?.signal?.throwIfAborted();

  const parsedInput = JSONObjectSchema.parse(graph.inputSchema.parse(input));

  const runId = await scheduler.start(graph.id, parsedInput, {
    sessionId: options?.sessionId,
    metadata: options?.metadata,
    pluginManager: options?.pluginManager,
    vcsContext: options?.vcsContext,
    vcsMiddleware: options?.vcsMiddleware,
    ...(options?.ownershipFence === undefined
      ? {}
      : { ownershipFence: options.ownershipFence }),
    ...(options?.assertRunOwnership === undefined
      ? {}
      : { assertRunOwnership: options.assertRunOwnership }),
  });

  const complete = new Promise<z.infer<TOutput>>((resolve, reject) => {
    let lastNodeError: Error | null = null;
    let abortRequested = false;

    const unsubError = eventBus.subscribe("run:error", (event) => {
      if (event.runId !== runId) return;
      const payload = event.payload;
      const msg =
        typeof payload["error"] === "string" ? payload["error"] : undefined;
      lastNodeError = Object.assign(
        new Error(msg ?? "Unknown graph node error"),
        payload.operationFailure
          ? { operationFailure: payload.operationFailure }
          : {},
      );
    });

    const unsubEnd = eventBus.subscribe("run:end", (event) => {
      if (event.runId !== runId) return;
      unsubError();
      unsubEnd();
      options?.signal?.removeEventListener("abort", handleAbort);

      const payload = event.payload;
      const status = payload["status"];

      if (abortRequested) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      if (status === "failed" || status === "cancelled") {
        reject(
          lastNodeError ??
            new Error(`Graph run ${runId} ended with status: ${status}`),
        );
        return;
      }

      // Extract result directly from the run:end payload blackboard data,
      // avoiding a DB round-trip and potential saveSnapshot race conditions.
      try {
        const blackboardData = JSONObjectSchema.parse(payload["blackboard"]);
        resolve(
          graph.extractResult({
            data: blackboardData,
          }),
        );
      } catch (err) {
        assert(err instanceof Error, "Captured object is not an Error");
        reject(err);
      }
    });

    const handleAbort = (): void => {
      abortRequested = true;
      void scheduler.cancel(runId).catch(() => undefined);
    };
    options?.signal?.addEventListener("abort", handleAbort, { once: true });
    if (options?.signal?.aborted) handleAbort();
  });

  return { runId, complete };
};
