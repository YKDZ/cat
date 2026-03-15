import * as crypto from "node:crypto";
import * as z from "zod/v4";

import type {
  DefineGraphTaskOptions,
  DefineGraphWorkflowOptions,
  GraphRunMeta,
  GraphRunResult,
  GraphStepInvocation,
  GraphTaskDefinition,
  TaskHandlerContext,
  WorkflowHandlerContext,
  WorkflowRuntime,
  ZodSchema,
} from "@/workflow/types";

import { resolveCacheKey } from "@/graph/cache";
import {
  createAgentEvent,
  normalizeEventEnvelope,
  type AgentEvent,
  type EventEnvelopeInput,
} from "@/graph/events";
import { getWorkflowRuntime } from "@/workflow/runtime";

type SideEffectOutputType = "db_write" | "api_call" | "event_publish";

const inflightExecutions = new Map<string, Promise<unknown>>();

type ExecutionContextArgs = {
  taskName: string;
  runId: string;
  traceId: string;
  runtime: WorkflowRuntime;
  signal?: AbortSignal;
  pluginManager?: GraphRunMeta["pluginManager"];
  nodeId?: string;
  bufferedEvents: EventEnvelopeInput[];
  rollbacks: Array<() => Promise<void>>;
};

const withNodeDefaults = (
  runId: string,
  nodeId: string,
  event: EventEnvelopeInput,
): AgentEvent => {
  return createAgentEvent(normalizeEventEnvelope(runId, nodeId, event));
};

const executeRollbackStack = async (
  rollbacks: Array<() => Promise<void>>,
): Promise<void> => {
  const reversed = [...rollbacks].reverse();
  for (const rollback of reversed) {
    // oxlint-disable-next-line no-await-in-loop
    await rollback();
  }
};

const createHandlerContext = (
  args: ExecutionContextArgs,
): TaskHandlerContext => {
  const nodeId = args.nodeId ?? args.taskName;

  const checkSideEffect = async <T>(key: string): Promise<T | null> => {
    const fullKey = `${args.taskName}:${args.traceId}:${key}`;
    const existing =
      await args.runtime.checkpointer.loadExternalOutputByIdempotency(
        args.runId,
        fullKey,
      );
    // oxlint-disable-next-line no-unsafe-type-assertion -- side-effect payloads are caller-defined and revalidated at task boundaries when needed.
    return (existing?.payload as T | undefined) ?? null;
  };

  return {
    runId: args.runId,
    traceId: args.traceId,
    signal: args.signal,
    pluginManager: args.pluginManager,
    emit: async (event) => {
      await args.runtime.eventBus.publish(
        withNodeDefaults(args.runId, nodeId, event),
      );
    },
    addEvent: (event) => {
      args.bufferedEvents.push(event);
    },
    onRollback: (fn) => {
      args.rollbacks.push(fn);
    },
    registerCompensation: (label, fn) => {
      args.runtime.compensationRegistry.register({
        runId: args.runId,
        nodeId,
        label,
        handler: fn,
      });
    },
    recordSideEffect: async <T>(
      key: string,
      outputType: SideEffectOutputType,
      payload: T,
    ): Promise<T | null> => {
      const existing = await checkSideEffect<T>(key);
      if (existing !== null) {
        return existing;
      }

      const fullKey = `${args.taskName}:${args.traceId}:${key}`;
      await args.runtime.checkpointer.saveExternalOutput({
        runId: args.runId,
        nodeId,
        outputType,
        outputKey: key,
        payload,
        idempotencyKey: fullKey,
        createdAt: new Date().toISOString(),
      });
      return null;
    },
    checkSideEffect,
  };
};

const publishBufferedEvents = async (
  runId: string,
  nodeId: string,
  runtime: WorkflowRuntime,
  events: EventEnvelopeInput[],
): Promise<void> => {
  for (const event of events) {
    // oxlint-disable-next-line no-await-in-loop
    await runtime.eventBus.publish(withNodeDefaults(runId, nodeId, event));
  }
};

const executeTaskDefinition = async <I extends ZodSchema, O extends ZodSchema>(
  definition: GraphTaskDefinition<I, O>,
  payload: z.input<I>,
  meta: GraphRunMeta | undefined,
  runtime: WorkflowRuntime,
): Promise<z.infer<O>> => {
  const runId = meta?.runId ?? crypto.randomUUID();
  const traceId = meta?.traceId ?? crypto.randomUUID();
  const executionKey = `${definition.name}:${runId}:${traceId}:${meta?.stepId ?? "root"}`;
  const existingExecution = inflightExecutions.get(executionKey);
  if (existingExecution) {
    return definition.schema.output.parse(await existingExecution);
  }

  const parsedPayload = definition.schema.input.parse(payload);
  const cacheKey = resolveCacheKey(
    definition.name,
    parsedPayload,
    definition.cache,
  );
  if (cacheKey) {
    const cached = await runtime.cacheStore.get(cacheKey);
    if (cached !== null) {
      return definition.schema.output.parse(cached);
    }

    const inflightCacheHit = inflightExecutions.get(cacheKey);
    if (inflightCacheHit) {
      return definition.schema.output.parse(await inflightCacheHit);
    }
  }

  const bufferedEvents: EventEnvelopeInput[] = [];
  const rollbacks: Array<() => Promise<void>> = [];
  const ctx = createHandlerContext({
    taskName: definition.name,
    runId,
    traceId,
    runtime,
    signal: meta?.signal,
    pluginManager: meta?.pluginManager,
    bufferedEvents,
    rollbacks,
  });

  const execution = (async (): Promise<z.infer<O>> => {
    const raw = await definition.handler(parsedPayload, ctx);
    const output = definition.schema.output.parse(raw);
    await publishBufferedEvents(
      runId,
      definition.name,
      runtime,
      bufferedEvents,
    );
    if (cacheKey) {
      await runtime.cacheStore.set(cacheKey, output, definition.cache?.ttl);
    }
    return output;
  })();

  inflightExecutions.set(executionKey, execution);
  if (cacheKey) {
    inflightExecutions.set(cacheKey, execution);
  }

  try {
    return await execution;
  } catch (error) {
    await executeRollbackStack(rollbacks);
    throw error;
  } finally {
    inflightExecutions.delete(executionKey);
    if (cacheKey) {
      inflightExecutions.delete(cacheKey);
    }
  }
};

const executeStepInvocation = async <
  I extends ZodSchema,
  O extends ZodSchema,
  Ctx extends TaskHandlerContext | WorkflowHandlerContext,
>(
  step: GraphStepInvocation<I, O, Ctx>,
  runId: string,
  traceId: string,
  runtime: WorkflowRuntime,
  signal?: AbortSignal,
  pluginManager?: GraphRunMeta["pluginManager"],
): Promise<z.infer<O>> => {
  const stepMeta: GraphRunMeta = {
    runId,
    traceId,
    signal: signal ?? step.meta?.signal,
    stepId: step.stepId,
    pluginManager: step.meta?.pluginManager ?? pluginManager,
  };
  return step.task
    .run(step.input, stepMeta)
    .then(async ({ result }) => result());
};

export const defineGraphTask = <I extends ZodSchema, O extends ZodSchema>(
  options: DefineGraphTaskOptions<I, O>,
): GraphTaskDefinition<I, O> => {
  const definition: GraphTaskDefinition<I, O> = {
    name: options.name,
    schema: {
      input: options.input,
      output: options.output,
    },
    cache: options.cache,
    handler: options.handler,
    run: async (input, meta): Promise<GraphRunResult<z.infer<O>>> => {
      const runtime = getWorkflowRuntime();
      const runId = meta?.runId ?? crypto.randomUUID();
      const promise = executeTaskDefinition(
        definition,
        input,
        { ...meta, runId },
        runtime,
      );
      return {
        runId,
        result: async () => promise,
      };
    },
    asStep: (input, meta) => {
      return {
        stepId: meta?.stepId ?? crypto.randomUUID().slice(0, 8),
        task: definition,
        input,
        meta,
      };
    },
  };

  return definition;
};

export const defineGraphWorkflow = <I extends ZodSchema, O extends ZodSchema>(
  options: DefineGraphWorkflowOptions<I, O>,
): GraphTaskDefinition<I, O, WorkflowHandlerContext> => {
  const definition: GraphTaskDefinition<I, O, WorkflowHandlerContext> = {
    name: options.name,
    schema: {
      input: options.input,
      output: options.output,
    },
    cache: options.cache,
    handler: options.handler,
    run: async (input, meta): Promise<GraphRunResult<z.infer<O>>> => {
      const runtime = getWorkflowRuntime();
      const runId = meta?.runId ?? crypto.randomUUID();
      const traceId = meta?.traceId ?? crypto.randomUUID();
      const executionKey = `${definition.name}:${runId}:${traceId}`;
      const inflightExisting = inflightExecutions.get(executionKey);
      if (inflightExisting) {
        return {
          runId,
          result: async () =>
            definition.schema.output.parse(await inflightExisting),
        };
      }

      const parsedPayload = definition.schema.input.parse(input);
      const cacheKey = resolveCacheKey(
        definition.name,
        parsedPayload,
        definition.cache,
      );
      if (cacheKey) {
        const inflightCacheHit = inflightExecutions.get(cacheKey);
        if (inflightCacheHit) {
          return {
            runId,
            result: async () =>
              definition.schema.output.parse(await inflightCacheHit),
          };
        }
      }

      const promise = (async (): Promise<z.infer<O>> => {
        if (cacheKey) {
          const cached = await runtime.cacheStore.get(cacheKey);
          if (cached !== null) {
            return definition.schema.output.parse(cached);
          }
        }

        const steps = await options.steps(parsedPayload, {
          runId,
          traceId,
          signal: meta?.signal,
        });

        const stepResults: Record<string, unknown> = {};
        const resultsByTask = new Map<string, unknown[]>();
        await Promise.all(
          steps.map(async (step) => {
            const output = await executeStepInvocation(
              step,
              runId,
              traceId,
              runtime,
              meta?.signal,
              meta?.pluginManager,
            );
            stepResults[`${step.task.name}:${step.stepId}`] = output;
            const current = resultsByTask.get(step.task.name) ?? [];
            current.push(output);
            resultsByTask.set(step.task.name, current);
          }),
        );

        const bufferedEvents: EventEnvelopeInput[] = [];
        const rollbacks: Array<() => Promise<void>> = [];
        const baseCtx = createHandlerContext({
          taskName: definition.name,
          runId,
          traceId,
          runtime,
          signal: meta?.signal,
          pluginManager: meta?.pluginManager,
          bufferedEvents,
          rollbacks,
        });

        const workflowCtx: WorkflowHandlerContext = {
          ...baseCtx,
          stepResults,
          getStepResult: (task, stepId) => {
            if (stepId) {
              const match = stepResults[`${task.name}:${stepId}`];
              return match === undefined
                ? []
                : [task.schema.output.parse(match)];
            }
            const found = resultsByTask.get(task.name) ?? [];
            return found.map((item) => task.schema.output.parse(item));
          },
        };

        try {
          const raw = await definition.handler(parsedPayload, workflowCtx);
          const output = definition.schema.output.parse(raw);
          await publishBufferedEvents(
            runId,
            definition.name,
            runtime,
            bufferedEvents,
          );
          if (cacheKey) {
            await runtime.cacheStore.set(
              cacheKey,
              output,
              definition.cache?.ttl,
            );
          }
          return output;
        } catch (error) {
          await executeRollbackStack(rollbacks);
          throw error;
        }
      })();

      inflightExecutions.set(executionKey, promise);
      if (cacheKey) {
        inflightExecutions.set(cacheKey, promise);
      }

      return {
        runId,
        result: async () => {
          try {
            return await promise;
          } finally {
            inflightExecutions.delete(executionKey);
            if (cacheKey) {
              inflightExecutions.delete(cacheKey);
            }
          }
        },
      };
    },
    asStep: (input, meta) => {
      return {
        stepId: meta?.stepId ?? crypto.randomUUID().slice(0, 8),
        task: definition,
        input,
        meta,
      };
    },
  };

  return definition;
};
