import { createHash } from "node:crypto";

import {
  agentRun,
  and,
  eq,
  inArray,
  task,
  taskTransitionRequest,
  translatableElement,
  sql,
} from "@cat/db";
import {
  BatchAutoTranslationTaskPhaseSchema,
  BatchAutoTranslationTaskResultSchema,
  OperationFailureInputSchema,
  type TaskActor,
  TaskActorSchema,
  type TaskAffectedResource,
  TaskAffectedResourceSchema,
  type TaskKind,
  TaskKindSchema,
  type TaskRuntime,
  TaskRuntimeSchema,
  type TaskScope,
  TaskScopeSchema,
  type TaskState,
  TaskStateSchema,
} from "@cat/shared";
import * as z from "zod";

import { createOperationFailure } from "#/commands/operation-failure/create-operation-failure.cmd.ts";
import type { Command, DbHandle } from "#/types.ts";

import {
  assertExpectedRevision,
  InvalidTaskProgressError,
  type TaskTransition,
  TaskCancellationNotAllowedError,
  TaskDispatchClaimConflictError,
  TaskNotFoundError,
  TaskRevisionConflictError,
  TaskTransitionRequestConflictError,
  transitionTaskStatus,
} from "./task-state.ts";

const transitionIntentFingerprint = (
  command: TransitionLocalizationTaskCommand,
): string => {
  const {
    expectedRevision: _expectedRevision,
    requestId: _requestId,
    ...intent
  } = command;
  return createHash("sha256").update(JSON.stringify(intent)).digest("hex");
};

const transitionFields = {
  taskId: z.uuidv4(),
  expectedRevision: z.int().nonnegative(),
  requestId: z.uuidv4(),
  projectionEventId: z.uuidv4().optional(),
  projectionEventSequence: z.int().positive().optional(),
  expectedRunId: z.uuidv4().optional(),
};

export const CreateLocalizationTaskCommandSchema = z
  .strictObject({
    task: TaskKindSchema,
    scope: TaskScopeSchema,
    actor: TaskActorSchema,
    resources: z.array(TaskAffectedResourceSchema),
  })
  .superRefine((value, ctx) => {
    if (value.task.payload.invocation.contentNodeIds.length !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["task", "payload", "invocation", "contentNodeIds"],
        message:
          "Persisted batch auto-translation tasks require resolved element IDs.",
      });
    }
    if (value.scope.type !== "PROJECT") return;

    if (value.task.payload.invocation.projectId !== value.scope.id) {
      ctx.addIssue({
        code: "custom",
        path: ["task", "payload", "invocation", "projectId"],
        message: "Task invocation project must match its project scope.",
      });
    }

    const projectResources = value.resources.filter(
      (resource) => resource.type === "PROJECT",
    );
    if (
      projectResources.length !== 1 ||
      projectResources[0]?.id !== value.scope.id
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["resources"],
        message:
          "Project-scoped tasks must include only their scoped project resource.",
      });
    }

    if (
      value.resources.some(
        (resource) =>
          resource.type !== "PROJECT" && resource.type !== "ELEMENT",
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["resources"],
        message:
          "Batch auto-translation resources may only include its project and elements.",
      });
    }

    const invocationElementIds = new Set(
      value.task.payload.invocation.elementIds.map(String),
    );
    const resourceElementIds = value.resources
      .filter((resource) => resource.type === "ELEMENT")
      .map((resource) => resource.id);
    if (
      resourceElementIds.length > 0 &&
      (resourceElementIds.length !== invocationElementIds.size ||
        resourceElementIds.some((id) => !invocationElementIds.has(id)))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["resources"],
        message: "Task element resources must match the invocation elements.",
      });
    }
  });

export const TransitionLocalizationTaskCommandSchema = z.discriminatedUnion(
  "transition",
  [
    z.strictObject({
      ...transitionFields,
      transition: z.literal("claimDispatch"),
      claimId: z.uuidv4(),
      leaseDurationMs: z.int().positive().max(300_000),
    }),
    z.strictObject({
      ...transitionFields,
      transition: z.literal("start"),
      phase: BatchAutoTranslationTaskPhaseSchema,
    }),
    z.strictObject({
      ...transitionFields,
      transition: z.literal("bindRun"),
      runId: z.uuidv4(),
      claimId: z.uuidv4(),
    }),
    z.strictObject({
      ...transitionFields,
      transition: z.literal("bindRunAndStart"),
      runId: z.uuidv4(),
      claimId: z.uuidv4(),
      phase: BatchAutoTranslationTaskPhaseSchema,
    }),
    z.strictObject({
      ...transitionFields,
      transition: z.literal("progress"),
      progressCurrent: z.int().nonnegative(),
      progressTotal: z.int().positive().optional(),
      phase: BatchAutoTranslationTaskPhaseSchema.optional(),
    }),
    z.strictObject({
      ...transitionFields,
      transition: z.literal("block"),
      failure: OperationFailureInputSchema,
    }),
    z.strictObject({ ...transitionFields, transition: z.literal("resume") }),
    z.strictObject({
      ...transitionFields,
      transition: z.literal("complete"),
      result: BatchAutoTranslationTaskResultSchema,
    }),
    z.strictObject({
      ...transitionFields,
      transition: z.literal("fail"),
      failure: OperationFailureInputSchema,
    }),
    z.strictObject({
      ...transitionFields,
      transition: z.literal("requestCancel"),
    }),
    z.strictObject({
      ...transitionFields,
      transition: z.literal("confirmCancel"),
      owner: z.literal("WORKFLOW_ADAPTER"),
    }),
  ],
);

export const RetryLocalizationTaskCommandSchema = z.strictObject({
  taskId: z.uuidv4(),
  actor: TaskActorSchema,
});

export type CreateLocalizationTaskCommand = z.infer<
  typeof CreateLocalizationTaskCommandSchema
>;
export type TransitionLocalizationTaskCommand = z.infer<
  typeof TransitionLocalizationTaskCommandSchema
>;
export type RetryLocalizationTaskCommand = z.infer<
  typeof RetryLocalizationTaskCommandSchema
>;

export type LocalizationTaskSummary = {
  id: string;
  task: TaskKind;
  state: TaskState;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

const toSummary = (row: {
  id: string;
  kind: TaskKind["kind"];
  payload: TaskKind["payload"];
  status: TaskState["status"];
  scopeType: TaskScope["type"];
  scopeId: string | null;
  actorType: TaskActor["type"];
  actorId: string | null;
  resources: TaskAffectedResource[];
  revision: number;
  progressCurrent: number | null;
  progressTotal: number | null;
  runtime: TaskRuntime;
  currentFailureId: string | null;
  retryOfTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}): LocalizationTaskSummary => ({
  id: row.id,
  task: TaskKindSchema.parse({ kind: row.kind, payload: row.payload }),
  state: TaskStateSchema.parse({
    status: row.status,
    scope: { type: row.scopeType, id: row.scopeId },
    actor: { type: row.actorType, id: row.actorId },
    resources: row.resources,
    revision: row.revision,
    progressCurrent: row.progressCurrent,
    progressTotal: row.progressTotal,
    runtime: row.runtime,
    currentFailureId: row.currentFailureId,
    retryOfTaskId: row.retryOfTaskId,
  }),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
});

const taskFields = {
  id: task.id,
  kind: task.kind,
  payload: task.payload,
  status: task.status,
  scopeType: task.scopeType,
  scopeId: task.scopeId,
  actorType: task.actorType,
  actorId: task.actorId,
  resources: task.resources,
  revision: task.revision,
  progressCurrent: task.progressCurrent,
  progressTotal: task.progressTotal,
  runtime: task.runtime,
  currentFailureId: task.currentFailureId,
  retryOfTaskId: task.retryOfTaskId,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  startedAt: task.startedAt,
  finishedAt: task.finishedAt,
};

const insertLocalizationTask = async (
  db: DbHandle,
  command: CreateLocalizationTaskCommand,
  retryOfTaskId?: string,
): Promise<LocalizationTaskSummary> => {
  const [row] = await db
    .insert(task)
    .values({
      kind: command.task.kind,
      payload: command.task.payload,
      scopeType: command.scope.type,
      scopeId: command.scope.id,
      actorType: command.actor.type,
      actorId: command.actor.id,
      resources: command.resources,
      runtime: {
        kind: command.task.kind,
        runId: null,
        dispatchClaimId: null,
        dispatchClaimExpiresAt: null,
        dispatchAttemptCount: 0,
        lastTransitionRequestId: null,
        lastProjectedEventSequence: null,
        phase: null,
        result: null,
      },
      retryOfTaskId,
    })
    .returning(taskFields);

  if (row === undefined) throw new Error("Task creation did not return a row.");

  return toSummary(row);
};

export const createLocalizationTask: Command<
  CreateLocalizationTaskCommand,
  LocalizationTaskSummary
> = async (ctx, command) => {
  const elementIds = command.task.payload.invocation.elementIds;
  if (elementIds.length > 0) {
    const ownedElements = await ctx.db
      .select({ id: translatableElement.id })
      .from(translatableElement)
      .where(
        and(
          inArray(translatableElement.id, elementIds),
          eq(
            translatableElement.projectId,
            command.task.payload.invocation.projectId,
          ),
        ),
      );
    if (ownedElements.length !== new Set(elementIds).size) {
      throw new InvalidTaskProgressError(
        "Every affected element must belong to the task project.",
      );
    }
  }
  return { result: await insertLocalizationTask(ctx.db, command), events: [] };
};

const transitionTask = async (
  db: DbHandle,
  command: TransitionLocalizationTaskCommand,
): Promise<LocalizationTaskSummary> => {
  const [current] = await db
    .select(taskFields)
    .from(task)
    .where(eq(task.id, command.taskId))
    .for("update");

  if (current === undefined) throw new TaskNotFoundError(command.taskId);

  const intentFingerprint = transitionIntentFingerprint(command);
  const [previousRequest] = await db
    .select({ intentFingerprint: taskTransitionRequest.intentFingerprint })
    .from(taskTransitionRequest)
    .where(
      and(
        eq(taskTransitionRequest.taskId, command.taskId),
        eq(taskTransitionRequest.requestId, command.requestId),
      ),
    );
  if (previousRequest) {
    if (previousRequest.intentFingerprint !== intentFingerprint) {
      throw new TaskTransitionRequestConflictError(
        command.taskId,
        command.requestId,
      );
    }
    return toSummary(current);
  }

  assertExpectedRevision(current.revision, command.expectedRevision);
  const currentTask = toSummary(current);
  if (
    command.expectedRunId !== undefined &&
    current.runtime.runId !== command.expectedRunId
  ) {
    throw new InvalidTaskProgressError(
      `Workflow run ${command.expectedRunId} is not bound to this task.`,
    );
  }
  if (
    command.transition === "requestCancel" &&
    !currentTask.task.payload.cancelable
  ) {
    throw new TaskCancellationNotAllowedError(command.taskId);
  }

  if (
    (command.transition === "bindRun" ||
      command.transition === "bindRunAndStart") &&
    current.runtime.runId !== null
  ) {
    if (current.runtime.runId === command.runId) return currentTask;
    throw new InvalidTaskProgressError(
      `Task is already bound to workflow run ${current.runtime.runId}.`,
    );
  }

  const clock = await db.execute<{ now: Date }>(
    sql`SELECT clock_timestamp() AS now`,
  );
  const now = z.coerce.date().parse(clock.rows[0]?.now);

  if (
    (command.transition === "bindRun" ||
      command.transition === "bindRunAndStart") &&
    (current.runtime.dispatchClaimId !== command.claimId ||
      current.runtime.dispatchClaimExpiresAt === null ||
      new Date(current.runtime.dispatchClaimExpiresAt).getTime() <=
        now.getTime())
  ) {
    throw new TaskDispatchClaimConflictError(command.taskId);
  }

  if (command.transition === "start" && current.runtime.runId === null) {
    throw new InvalidTaskProgressError(
      "A workflow run must be bound before a task can start.",
    );
  }

  if (
    command.transition === "confirmCancel" &&
    current.runtime.runId === null &&
    current.runtime.dispatchClaimId !== null &&
    current.runtime.dispatchClaimExpiresAt !== null &&
    new Date(current.runtime.dispatchClaimExpiresAt).getTime() > now.getTime()
  ) {
    throw new TaskDispatchClaimConflictError(command.taskId);
  }
  if (command.transition === "confirmCancel") {
    if (current.runtime.runId === null) {
      const [allocatedRun] = await db
        .select({ status: agentRun.status })
        .from(agentRun)
        .where(
          eq(agentRun.deduplicationKey, `localization-task:${command.taskId}`),
        );
      if (
        allocatedRun?.status !== undefined &&
        allocatedRun.status !== "cancelled"
      ) {
        throw new TaskDispatchClaimConflictError(command.taskId);
      }
    } else {
      const [run] = await db
        .select({ status: agentRun.status })
        .from(agentRun)
        .where(eq(agentRun.externalId, current.runtime.runId));
      if (run?.status !== "cancelled") {
        throw new InvalidTaskProgressError(
          "A bound task may only confirm cancellation after its workflow run is cancelled.",
        );
      }
    }
  }

  let dispatchClaimExpiresAt = current.runtime.dispatchClaimExpiresAt;
  if (command.transition === "claimDispatch") {
    const currentExpiry = current.runtime.dispatchClaimExpiresAt;
    const claimIsActive =
      current.runtime.dispatchClaimId !== null &&
      currentExpiry !== null &&
      new Date(currentExpiry).getTime() > now.getTime();
    if (claimIsActive && current.runtime.dispatchClaimId !== command.claimId) {
      throw new TaskDispatchClaimConflictError(command.taskId);
    }
    dispatchClaimExpiresAt = new Date(
      now.getTime() + command.leaseDurationMs,
    ).toISOString();
  }

  const status = transitionTaskStatus(
    currentTask.state.status,
    command.transition as TaskTransition,
  );
  const progressCurrent =
    command.transition === "progress"
      ? command.progressCurrent
      : current.progressCurrent;
  const progressTotal =
    command.transition === "progress"
      ? (command.progressTotal ?? current.progressTotal)
      : current.progressTotal;
  if (
    command.transition === "progress" &&
    (progressCurrent === null ||
      progressTotal === null ||
      progressCurrent > progressTotal)
  ) {
    throw new InvalidTaskProgressError(
      "Task progress requires a total no smaller than its current value.",
    );
  }
  if (
    command.transition === "progress" &&
    current.progressCurrent !== null &&
    command.progressCurrent < current.progressCurrent
  ) {
    throw new InvalidTaskProgressError("Task progress cannot move backwards.");
  }

  const phaseOrder = ["PREPARING", "TRANSLATING", "INDEXING"] as const;
  const nextPhase =
    command.transition === "start" ||
    (command.transition === "bindRunAndStart" && status === "RUNNING")
      ? command.phase
      : command.transition === "progress"
        ? (command.phase ?? current.runtime.phase)
        : current.runtime.phase;
  if (
    current.runtime.phase !== null &&
    nextPhase !== null &&
    phaseOrder.indexOf(nextPhase) < phaseOrder.indexOf(current.runtime.phase)
  ) {
    throw new InvalidTaskProgressError("Task phase cannot move backwards.");
  }

  const runtime = TaskRuntimeSchema.parse({
    kind: current.runtime.kind,
    runId:
      command.transition === "bindRun" ||
      command.transition === "bindRunAndStart"
        ? command.runId
        : command.transition === "resume"
          ? null
          : current.runtime.runId,
    dispatchClaimId:
      command.transition === "bindRun" ||
      command.transition === "bindRunAndStart"
        ? null
        : command.transition === "claimDispatch"
          ? command.claimId
          : command.transition === "resume"
            ? null
            : current.runtime.dispatchClaimId,
    dispatchClaimExpiresAt:
      command.transition === "bindRun" ||
      command.transition === "bindRunAndStart"
        ? null
        : command.transition === "claimDispatch"
          ? dispatchClaimExpiresAt
          : command.transition === "resume"
            ? null
            : current.runtime.dispatchClaimExpiresAt,
    dispatchAttemptCount:
      command.transition === "claimDispatch"
        ? current.runtime.dispatchAttemptCount + 1
        : current.runtime.dispatchAttemptCount,
    lastTransitionRequestId: command.requestId,
    lastProjectedEventSequence:
      command.transition === "resume"
        ? null
        : (command.projectionEventSequence ??
          current.runtime.lastProjectedEventSequence),
    phase: command.transition === "resume" ? null : nextPhase,
    result:
      command.transition === "complete"
        ? command.result
        : command.transition === "resume"
          ? null
          : current.runtime.result,
  });
  let currentFailureId = current.currentFailureId;
  if (command.transition === "block" || command.transition === "fail") {
    const failure = await createOperationFailure(
      { db },
      { failure: command.failure, taskId: command.taskId },
    );
    currentFailureId = failure.result.id;
  } else if (
    command.transition === "resume" ||
    command.transition === "complete" ||
    command.transition === "confirmCancel"
  ) {
    currentFailureId = null;
  }

  const [updated] = await db
    .update(task)
    .set({
      status,
      revision: current.revision + 1,
      progressCurrent,
      progressTotal,
      runtime,
      currentFailureId,
      startedAt:
        command.transition === "start" ||
        (command.transition === "bindRunAndStart" && status === "RUNNING")
          ? (current.startedAt ?? now)
          : current.startedAt,
      finishedAt:
        status === "COMPLETED" || status === "FAILED" || status === "CANCELED"
          ? now
          : current.finishedAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(task.id, command.taskId),
        eq(task.revision, command.expectedRevision),
      ),
    )
    .returning(taskFields);

  if (updated === undefined) {
    throw new TaskRevisionConflictError(command.expectedRevision);
  }

  await db.insert(taskTransitionRequest).values({
    taskId: command.taskId,
    requestId: command.requestId,
    intentFingerprint,
  });

  return toSummary(updated);
};

export const transitionLocalizationTask: Command<
  TransitionLocalizationTaskCommand,
  LocalizationTaskSummary
> = async (ctx, command) => {
  const result = await ctx.db.transaction((tx) => transitionTask(tx, command));

  return { result, events: [] };
};

export const retryLocalizationTask: Command<
  RetryLocalizationTaskCommand,
  LocalizationTaskSummary
> = async (ctx, command) => {
  const retry = async (db: DbHandle): Promise<LocalizationTaskSummary> => {
    const [failedTask] = await db
      .select(taskFields)
      .from(task)
      .where(eq(task.id, command.taskId))
      .for("update");

    if (failedTask === undefined) throw new TaskNotFoundError(command.taskId);

    const previous = toSummary(failedTask);
    if (previous.state.status !== "FAILED") {
      throw new InvalidTaskProgressError("Only failed tasks may be retried.");
    }

    const [inserted] = await db
      .insert(task)
      .values({
        kind: previous.task.kind,
        payload: previous.task.payload,
        scopeType: previous.state.scope.type,
        scopeId: previous.state.scope.id,
        actorType: command.actor.type,
        actorId: command.actor.id,
        resources: previous.state.resources,
        runtime: {
          kind: previous.task.kind,
          runId: null,
          dispatchClaimId: null,
          dispatchClaimExpiresAt: null,
          dispatchAttemptCount: 0,
          lastTransitionRequestId: null,
          lastProjectedEventSequence: null,
          phase: null,
          result: null,
        },
        retryOfTaskId: previous.id,
      })
      .onConflictDoNothing({ target: task.retryOfTaskId })
      .returning(taskFields);
    if (inserted !== undefined) return toSummary(inserted);

    const [existing] = await db
      .select(taskFields)
      .from(task)
      .where(eq(task.retryOfTaskId, previous.id));
    if (existing === undefined) {
      throw new Error("Task retry conflict did not resolve to a linked task.");
    }
    return toSummary(existing);
  };
  const result = await ctx.db.transaction(retry);

  return { result, events: [] };
};

export { taskFields, toSummary };
