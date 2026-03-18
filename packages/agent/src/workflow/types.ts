import type { PluginManager } from "@cat/plugin-core";

import * as z from "zod/v4";

import type { CacheOptions, CacheStore } from "@/graph/cache";
import type { Checkpointer } from "@/graph/checkpointer";
import type { CompensationRegistry } from "@/graph/compensation";
import type { EventBus } from "@/graph/event-bus";
import type { EventEnvelopeInput } from "@/graph/events";
import type { WorkflowLogger } from "@/graph/workflow-logger";

export type ZodSchema<T = unknown> = z.ZodType<T>;

export type GraphRunMeta = {
  runId?: string;
  traceId?: string;
  stepId?: string;
  signal?: AbortSignal;
  pluginManager?: PluginManager;
};

export type GraphRunResult<T> = {
  runId: string;
  result: () => Promise<T>;
};

export type TaskHandlerContext = {
  runId: string;
  traceId: string;
  signal?: AbortSignal;
  pluginManager?: PluginManager;
  emit: (event: EventEnvelopeInput) => Promise<void>;
  addEvent: (event: EventEnvelopeInput) => void;
  onRollback: (fn: () => Promise<void>) => void;
  registerCompensation: (label: string, fn: () => Promise<void>) => void;
  recordSideEffect: <T>(
    key: string,
    outputType: "db_write" | "api_call" | "event_publish",
    payload: T,
  ) => Promise<T | null>;
  checkSideEffect: <T>(key: string) => Promise<T | null>;
};

export type WorkflowHandlerContext = TaskHandlerContext & {
  stepResults: Record<string, unknown>;
  getStepResult: <
    I extends ZodSchema,
    O extends ZodSchema,
    Ctx extends TaskHandlerContext | WorkflowHandlerContext,
  >(
    task: GraphTaskDefinition<I, O, Ctx>,
    stepId?: string,
  ) => Array<z.infer<O>>;
};

export type WorkflowRuntime = {
  checkpointer: Checkpointer;
  cacheStore: CacheStore;
  compensationRegistry: CompensationRegistry;
  eventBus: EventBus;
  logger: WorkflowLogger;
};

export type GraphStepInvocation<
  I extends ZodSchema,
  O extends ZodSchema,
  Ctx extends TaskHandlerContext | WorkflowHandlerContext,
> = {
  stepId: string;
  task: GraphTaskDefinition<I, O, Ctx>;
  input: z.input<I>;
  meta?: GraphRunMeta;
};

export type GraphTaskDefinition<
  I extends ZodSchema,
  O extends ZodSchema,
  Ctx extends TaskHandlerContext | WorkflowHandlerContext = TaskHandlerContext,
> = {
  name: string;
  schema: {
    input: I;
    output: O;
  };
  cache?: CacheOptions;
  handler: (payload: z.infer<I>, ctx: Ctx) => Promise<z.infer<O>>;
  run: (
    input: z.input<I>,
    meta?: GraphRunMeta,
  ) => Promise<GraphRunResult<z.infer<O>>>;
  asStep: (
    input: z.input<I>,
    meta?: Omit<GraphRunMeta, "runId">,
  ) => GraphStepInvocation<I, O, Ctx>;
};

export type DefineGraphTaskOptions<I extends ZodSchema, O extends ZodSchema> = {
  name: string;
  input: I;
  output: O;
  cache?: CacheOptions;
  handler: (
    payload: z.infer<I>,
    ctx: TaskHandlerContext,
  ) => Promise<z.infer<O>>;
};

export type DefineGraphWorkflowOptions<
  I extends ZodSchema,
  O extends ZodSchema,
> = {
  name: string;
  input: I;
  output: O;
  cache?: CacheOptions;
  steps: (
    payload: z.infer<I>,
    ctx: Pick<TaskHandlerContext, "runId" | "traceId" | "signal">,
  ) =>
    | Promise<
        Array<
          GraphStepInvocation<
            ZodSchema,
            ZodSchema,
            TaskHandlerContext | WorkflowHandlerContext
          >
        >
      >
    | Array<
        GraphStepInvocation<
          ZodSchema,
          ZodSchema,
          TaskHandlerContext | WorkflowHandlerContext
        >
      >;
  handler: (
    payload: z.infer<I>,
    ctx: WorkflowHandlerContext,
  ) => Promise<z.infer<O>>;
};
