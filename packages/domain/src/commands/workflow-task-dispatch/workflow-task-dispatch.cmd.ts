import { randomUUID } from "node:crypto";

import {
  agentRun,
  and,
  eq,
  inArray,
  sql,
  task,
  translatableElement,
  workflowTaskDispatch,
} from "@cat/db";
import type { WorkflowTaskDispatchStatus } from "@cat/shared";
import { OperationFailureInputSchema } from "@cat/shared";
import * as z from "zod";

import {
  createOrClaimAgentRunOwnershipInTransaction,
  CreateOrClaimAgentRunOwnershipCommandSchema,
  type CreateOrClaimAgentRunOwnershipResult,
} from "#/commands/agent/create-or-claim-agent-run-ownership.cmd.ts";
import {
  InvalidTaskProgressError,
  TaskNotFoundError,
  TaskRevisionConflictError,
} from "#/commands/localization-task/task-state.ts";
import {
  insertLocalizationTask,
  type CreateLocalizationTaskCommand,
  CreateLocalizationTaskCommandSchema,
  type LocalizationTaskSummary,
  taskFields,
  toSummary,
  transitionTask,
} from "#/commands/localization-task/upsert-localization-task.cmd.ts";
import type { Command, DbHandle } from "#/types.ts";

export type WorkflowTaskDispatch = {
  id: string;
  taskId: string;
  generation: number;
  runId: string;
  status: WorkflowTaskDispatchStatus;
  ownerId: string | null;
  ownerEpoch: number;
  ownerLeaseExpiresAt: Date | null;
  attemptCount: number;
  agentSessionId: number | null;
  lastProjectedEventSequence: number;
  settledAt: Date | null;
};

const OwnershipFenceSchema = z.strictObject({
  ownerId: z.uuidv4(),
  epoch: z.int().positive(),
});

export type DispatchOwnershipFence = z.infer<typeof OwnershipFenceSchema>;
export type AgentRunOwnershipFence = z.infer<typeof OwnershipFenceSchema>;

const dispatchFields = {
  id: workflowTaskDispatch.id,
  taskId: workflowTaskDispatch.taskId,
  generation: workflowTaskDispatch.generation,
  runId: workflowTaskDispatch.runId,
  status: workflowTaskDispatch.status,
  ownerId: workflowTaskDispatch.ownerId,
  ownerEpoch: workflowTaskDispatch.ownerEpoch,
  ownerLeaseExpiresAt: workflowTaskDispatch.ownerLeaseExpiresAt,
  attemptCount: workflowTaskDispatch.attemptCount,
  agentSessionId: workflowTaskDispatch.agentSessionId,
  lastProjectedEventSequence: workflowTaskDispatch.lastProjectedEventSequence,
  settledAt: workflowTaskDispatch.settledAt,
};

const toDispatch = (row: WorkflowTaskDispatch): WorkflowTaskDispatch => row;

const lockLatestDispatchForTask = async (
  db: DbHandle,
  taskId: string,
): Promise<WorkflowTaskDispatch | null> => {
  const [binding] = await db
    .select(dispatchFields)
    .from(workflowTaskDispatch)
    .where(eq(workflowTaskDispatch.taskId, taskId))
    .orderBy(sql`${workflowTaskDispatch.generation} desc`)
    .limit(1)
    .for("update");
  return binding ? toDispatch(binding) : null;
};

const createIntent = async (
  db: DbHandle,
  taskId: string,
  generation: number,
): Promise<WorkflowTaskDispatch> => {
  const [row] = await db
    .insert(workflowTaskDispatch)
    .values({ taskId, generation })
    .returning(dispatchFields);
  if (!row)
    throw new Error("Workflow task dispatch creation did not return a row.");
  return toDispatch(row);
};

const validateTaskElements = async (
  db: DbHandle,
  command: CreateLocalizationTaskCommand,
): Promise<void> => {
  const elementIds = command.task.payload.invocation.elementIds;
  if (elementIds.length === 0) return;
  const owned = await db
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
  if (owned.length !== new Set(elementIds).size) {
    throw new InvalidTaskProgressError(
      "Every affected element must belong to the task project.",
    );
  }
};

export const CreateWorkflowTaskWithDispatchCommandSchema =
  CreateLocalizationTaskCommandSchema;
export type CreateWorkflowTaskWithDispatchCommand = z.infer<
  typeof CreateWorkflowTaskWithDispatchCommandSchema
>;

const isBatchWorkflowTask = (
  command: CreateWorkflowTaskWithDispatchCommand,
): command is CreateLocalizationTaskCommand =>
  command.task.kind === "BATCH_AUTO_TRANSLATION";

/** Atomically creates the user-visible Task and generation-one execution intent. */
export const createWorkflowTaskWithDispatch: Command<
  CreateWorkflowTaskWithDispatchCommand,
  { task: LocalizationTaskSummary; dispatch: WorkflowTaskDispatch }
> = async (ctx, command) => {
  const parsed = CreateWorkflowTaskWithDispatchCommandSchema.parse(command);
  if (!isBatchWorkflowTask(parsed)) {
    throw new InvalidTaskProgressError(
      "Workflow dispatch supports batch auto-translation tasks only.",
    );
  }
  const result = await ctx.db.transaction(async (tx) => {
    await validateTaskElements(tx, parsed);
    const created = await insertLocalizationTask(tx, parsed);
    const dispatch = await createIntent(tx, created.id, 1);
    return { task: created, dispatch };
  });
  return { result, events: [] };
};

export const RetryWorkflowTaskWithDispatchCommandSchema = z.strictObject({
  taskId: z.uuidv4(),
  actorId: z.uuidv4(),
});
export type RetryWorkflowTaskWithDispatchCommand = z.infer<
  typeof RetryWorkflowTaskWithDispatchCommandSchema
>;

/** Failed-task retries create both the replacement Task and its intent together. */
export const retryWorkflowTaskWithDispatch: Command<
  RetryWorkflowTaskWithDispatchCommand,
  { task: LocalizationTaskSummary; dispatch: WorkflowTaskDispatch }
> = async (ctx, command) => {
  const result = await ctx.db.transaction(async (tx) => {
    // Every command touching both projections takes the private dispatch lock
    // before the user-visible Task lock.
    await lockLatestDispatchForTask(tx, command.taskId);
    const [failed] = await tx
      .select(taskFields)
      .from(task)
      .where(eq(task.id, command.taskId))
      .for("update");
    if (!failed) throw new TaskNotFoundError(command.taskId);
    const previous = toSummary(failed);
    if (previous.state.status !== "FAILED") {
      throw new InvalidTaskProgressError("Only failed tasks may be retried.");
    }
    const [existing] = await tx
      .select(taskFields)
      .from(task)
      .where(eq(task.retryOfTaskId, previous.id));
    const next = existing
      ? toSummary(existing)
      : await insertLocalizationTask(
          tx,
          {
            task: previous.task,
            scope: previous.state.scope,
            actor: { type: "USER", id: command.actorId },
            resources: previous.state.resources,
          },
          previous.id,
        );
    const [intent] = await tx
      .select(dispatchFields)
      .from(workflowTaskDispatch)
      .where(eq(workflowTaskDispatch.taskId, next.id));
    return {
      task: next,
      dispatch: intent
        ? toDispatch(intent)
        : await createIntent(tx, next.id, 1),
    };
  });
  return { result, events: [] };
};

export const ResumeWorkflowTaskWithDispatchCommandSchema = z.strictObject({
  taskId: z.uuidv4(),
  requestId: z.uuidv4(),
});
export type ResumeWorkflowTaskWithDispatchCommand = z.infer<
  typeof ResumeWorkflowTaskWithDispatchCommandSchema
>;

/** Resuming a blocked task creates the next execution generation exactly once. */
export const resumeWorkflowTaskWithDispatch: Command<
  ResumeWorkflowTaskWithDispatchCommand,
  { task: LocalizationTaskSummary; dispatch: WorkflowTaskDispatch }
> = async (ctx, command) => {
  const result = await ctx.db.transaction(async (tx) => {
    const latestDispatch = await lockLatestDispatchForTask(tx, command.taskId);
    const [before] = await tx
      .select(taskFields)
      .from(task)
      .where(eq(task.id, command.taskId))
      .for("update");
    if (!before) throw new TaskNotFoundError(command.taskId);
    if (before.status === "PENDING") {
      // A replayed Task command is identified by TaskTransitionRequest. It must
      // return the generation it already created instead of allocating another.
      const resumed = await transitionTask(tx, {
        taskId: command.taskId,
        expectedRevision: before.revision,
        requestId: command.requestId,
        transition: "resume",
      });
      if (!latestDispatch)
        throw new Error("Resumed task has no workflow dispatch.");
      return { task: resumed, dispatch: latestDispatch };
    }
    const resumed = await transitionTask(tx, {
      taskId: command.taskId,
      expectedRevision: before.revision,
      requestId: command.requestId,
      transition: "resume",
    });
    if (latestDispatch?.status !== "SETTLED") {
      throw new InvalidTaskProgressError(
        "Blocked task dispatch has not settled.",
      );
    }
    const generation = (latestDispatch?.generation ?? 0) + 1;
    const [existing] = await tx
      .select(dispatchFields)
      .from(workflowTaskDispatch)
      .where(
        and(
          eq(workflowTaskDispatch.taskId, command.taskId),
          eq(workflowTaskDispatch.generation, generation),
        ),
      );
    return {
      task: resumed,
      dispatch: existing
        ? toDispatch(existing)
        : await createIntent(tx, command.taskId, generation),
    };
  });
  return { result, events: [] };
};

export const ClaimWorkflowTaskDispatchCommandSchema = z.strictObject({
  dispatchId: z.uuidv4().optional(),
  ownerId: z.uuidv4(),
  leaseDurationMs: z.int().positive().max(300_000),
});
export type ClaimWorkflowTaskDispatchCommand = z.infer<
  typeof ClaimWorkflowTaskDispatchCommandSchema
>;

/** Claims only owner-private intents. It never scans Task PENDING rows. */
export const claimWorkflowTaskDispatch: Command<
  ClaimWorkflowTaskDispatchCommand,
  WorkflowTaskDispatch | null
> = async (ctx, command) => {
  const result = await ctx.db.transaction(async (tx) => {
    const [candidate] = await tx
      .select(dispatchFields)
      .from(workflowTaskDispatch)
      .where(
        and(
          sql`(${workflowTaskDispatch.status} = 'REQUESTED' OR ((${workflowTaskDispatch.status} = 'CLAIMED' OR ${workflowTaskDispatch.status} = 'RUNNING' OR ${workflowTaskDispatch.status} = 'CANCELLING') AND (${workflowTaskDispatch.ownerLeaseExpiresAt} IS NULL OR ${workflowTaskDispatch.ownerLeaseExpiresAt} <= clock_timestamp())))`,
          ...(command.dispatchId === undefined
            ? []
            : [eq(workflowTaskDispatch.id, command.dispatchId)]),
        ),
      )
      .orderBy(workflowTaskDispatch.createdAt)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return null;
    const [claimed] = await tx
      .update(workflowTaskDispatch)
      .set({
        status:
          candidate.status === "CANCELLING"
            ? "CANCELLING"
            : candidate.status === "RUNNING"
              ? "RUNNING"
              : "CLAIMED",
        ownerId: command.ownerId,
        ownerEpoch: candidate.ownerEpoch + 1,
        ownerLeaseExpiresAt: sql`clock_timestamp() + (${command.leaseDurationMs} * interval '1 millisecond')`,
        attemptCount: candidate.attemptCount + 1,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(eq(workflowTaskDispatch.id, candidate.id))
      .returning(dispatchFields);
    return claimed ? toDispatch(claimed) : null;
  });
  return { result, events: [] };
};

export const RenewWorkflowTaskDispatchCommandSchema = z.strictObject({
  dispatchId: z.uuidv4(),
  ownerId: z.uuidv4(),
  ownerEpoch: z.int().positive(),
  leaseDurationMs: z.int().positive().max(300_000),
});
export type RenewWorkflowTaskDispatchCommand = z.infer<
  typeof RenewWorkflowTaskDispatchCommandSchema
>;

/** Extends only the current owner's active dispatch lease without changing its epoch or attempt. */
export const renewWorkflowTaskDispatch: Command<
  RenewWorkflowTaskDispatchCommand,
  boolean
> = async (ctx, command) => {
  const [renewed] = await ctx.db
    .update(workflowTaskDispatch)
    .set({
      ownerLeaseExpiresAt: sql`clock_timestamp() + (${command.leaseDurationMs} * interval '1 millisecond')`,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(workflowTaskDispatch.id, command.dispatchId),
        eq(workflowTaskDispatch.ownerId, command.ownerId),
        eq(workflowTaskDispatch.ownerEpoch, command.ownerEpoch),
        sql`${workflowTaskDispatch.status} IN ('CLAIMED', 'RUNNING', 'CANCELLING')`,
        sql`${workflowTaskDispatch.ownerLeaseExpiresAt} > clock_timestamp()`,
      ),
    )
    .returning({ id: workflowTaskDispatch.id });
  return { result: renewed !== undefined, events: [] };
};

export const BindWorkflowTaskDispatchSessionCommandSchema = z.strictObject({
  dispatchId: z.uuidv4(),
  ownerId: z.uuidv4(),
  ownerEpoch: z.int().positive(),
  agentSessionId: z.int().positive(),
});
export type BindWorkflowTaskDispatchSessionCommand = z.infer<
  typeof BindWorkflowTaskDispatchSessionCommandSchema
>;

export const bindWorkflowTaskDispatchSession: Command<
  BindWorkflowTaskDispatchSessionCommand,
  WorkflowTaskDispatch
> = async (ctx, command) => {
  const [row] = await ctx.db
    .update(workflowTaskDispatch)
    .set({
      agentSessionId: command.agentSessionId,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(workflowTaskDispatch.id, command.dispatchId),
        eq(workflowTaskDispatch.status, "CLAIMED"),
        eq(workflowTaskDispatch.ownerId, command.ownerId),
        eq(workflowTaskDispatch.ownerEpoch, command.ownerEpoch),
        sql`${workflowTaskDispatch.ownerLeaseExpiresAt} > clock_timestamp()`,
      ),
    )
    .returning(dispatchFields);
  if (!row) throw new TaskRevisionConflictError(command.ownerEpoch);
  return { result: toDispatch(row), events: [] };
};

const AgentRunOwnershipInputSchema =
  CreateOrClaimAgentRunOwnershipCommandSchema.omit({
    ownerId: true,
    leaseDurationMs: true,
  });

export const AcquireWorkflowTaskDispatchRunOwnershipCommandSchema =
  z.strictObject({
    dispatchId: z.uuidv4(),
    ownerId: z.uuidv4(),
    ownerEpoch: z.int().positive(),
    leaseDurationMs: z.int().positive().max(300_000),
    agentRun: AgentRunOwnershipInputSchema,
  });
export type AcquireWorkflowTaskDispatchRunOwnershipCommand = z.infer<
  typeof AcquireWorkflowTaskDispatchRunOwnershipCommandSchema
>;
export type AcquireWorkflowTaskDispatchRunOwnershipResult =
  | {
      kind: "claimed";
      runId: string;
      sessionId: number;
      ownerId: string;
      epoch: number;
      created: boolean;
    }
  | Exclude<CreateOrClaimAgentRunOwnershipResult, { kind: "claimed" }>
  | {
      kind: "dispatch-identity-conflict";
      expectedRunId: string;
      actualRunId: string;
      expectedSessionId: number;
      actualSessionId: number | null;
    }
  | null;

class GuardedDispatchAcquisitionRollback extends Error {
  readonly result: AcquireWorkflowTaskDispatchRunOwnershipResult;

  constructor(result: AcquireWorkflowTaskDispatchRunOwnershipResult) {
    super("Guarded workflow task dispatch acquisition must roll back.");
    this.result = result;
  }
}

const isLiveDispatchFence = (
  binding: WorkflowTaskDispatch,
  command: AcquireWorkflowTaskDispatchRunOwnershipCommand,
  now: Date,
): boolean => {
  return (
    binding.ownerId === command.ownerId &&
    binding.ownerEpoch === command.ownerEpoch &&
    binding.agentSessionId === command.agentRun.sessionId &&
    binding.runId === command.agentRun.externalId &&
    (binding.status === "CLAIMED" ||
      binding.status === "RUNNING" ||
      binding.status === "CANCELLING") &&
    binding.ownerLeaseExpiresAt !== null &&
    binding.ownerLeaseExpiresAt.getTime() > now.getTime()
  );
};

const getDatabaseNow = async (db: DbHandle): Promise<Date> => {
  const clock = await db.execute<{ now: Date }>(
    sql`SELECT clock_timestamp() AS now`,
  );
  return z.coerce.date().parse(clock.rows[0]?.now);
};

/**
 * Takes the dispatch and AgentRun fences in one transaction. Dispatch always
 * locks first, so an obsolete or remote dispatch cannot alter AgentRun state.
 */
export const acquireWorkflowTaskDispatchRunOwnership: Command<
  AcquireWorkflowTaskDispatchRunOwnershipCommand,
  AcquireWorkflowTaskDispatchRunOwnershipResult
> = async (ctx, command) => {
  const parsed =
    AcquireWorkflowTaskDispatchRunOwnershipCommandSchema.parse(command);
  const result = await ctx.db
    .transaction(async (tx) => {
      const [binding] = await tx
        .select(dispatchFields)
        .from(workflowTaskDispatch)
        .where(eq(workflowTaskDispatch.id, parsed.dispatchId))
        .for("update");
      if (!binding) return null;

      const clock = await tx.execute<{ now: Date }>(
        sql`SELECT clock_timestamp() AS now`,
      );
      const beforeRunLock = z.coerce.date().parse(clock.rows[0]?.now);
      if (!isLiveDispatchFence(toDispatch(binding), parsed, beforeRunLock)) {
        return null;
      }

      const claim = await createOrClaimAgentRunOwnershipInTransaction(tx, {
        ...parsed.agentRun,
        ownerId: parsed.ownerId,
        leaseDurationMs: parsed.leaseDurationMs,
      });
      if (claim.kind !== "claimed") {
        if (claim.kind === "identity-conflict") {
          throw new GuardedDispatchAcquisitionRollback(claim);
        }
        return claim;
      }

      // Acquiring the AgentRun identity can wait. Recheck the dispatch against a
      // fresh database clock before commit so an expired owner rolls back both.
      const afterRunClock = await tx.execute<{ now: Date }>(
        sql`SELECT clock_timestamp() AS now`,
      );
      const afterRunLock = z.coerce.date().parse(afterRunClock.rows[0]?.now);
      if (!isLiveDispatchFence(toDispatch(binding), parsed, afterRunLock)) {
        // A normal return would commit the AgentRun claim made while waiting for
        // its row lock. Abort the whole transaction before mapping the conflict.
        throw new GuardedDispatchAcquisitionRollback(null);
      }
      const [claimedRun] = await tx
        .select({
          externalId: agentRun.externalId,
          sessionId: agentRun.sessionId,
        })
        .from(agentRun)
        .where(eq(agentRun.externalId, claim.runId))
        .for("update");
      if (
        !claimedRun ||
        claim.runId !== binding.runId ||
        claimedRun.sessionId !== binding.agentSessionId ||
        claimedRun.sessionId !== parsed.agentRun.sessionId
      ) {
        throw new GuardedDispatchAcquisitionRollback({
          kind: "dispatch-identity-conflict",
          expectedRunId: binding.runId,
          actualRunId: claim.runId,
          expectedSessionId:
            binding.agentSessionId ?? parsed.agentRun.sessionId,
          actualSessionId: claimedRun?.sessionId ?? null,
        });
      }
      return {
        kind: "claimed" as const,
        runId: claim.runId,
        sessionId: parsed.agentRun.sessionId,
        ownerId: parsed.ownerId,
        epoch: claim.epoch,
        created: claim.created,
      };
    })
    .catch((error: unknown) => {
      if (error instanceof GuardedDispatchAcquisitionRollback) {
        return error.result;
      }
      throw error;
    });
  return { result, events: [] };
};

export const ActivateWorkflowTaskDispatchCommandSchema = z.strictObject({
  dispatchId: z.uuidv4(),
  dispatchFence: OwnershipFenceSchema,
  runFence: OwnershipFenceSchema,
  requestId: z.uuidv4(),
});
export type ActivateWorkflowTaskDispatchCommand = z.infer<
  typeof ActivateWorkflowTaskDispatchCommandSchema
>;

/** Fences activation before run:start and before the scheduler can dispatch nodes. */
export const activateWorkflowTaskDispatch: Command<
  ActivateWorkflowTaskDispatchCommand,
  {
    task: LocalizationTaskSummary;
    dispatch: WorkflowTaskDispatch;
    cancelled: boolean;
  }
> = async (ctx, command) => {
  const result = await ctx.db.transaction(async (tx) => {
    if (command.dispatchFence.ownerId !== command.runFence.ownerId) {
      throw new TaskRevisionConflictError(command.dispatchFence.epoch);
    }
    const [binding] = await tx
      .select(dispatchFields)
      .from(workflowTaskDispatch)
      .where(eq(workflowTaskDispatch.id, command.dispatchId))
      .for("update");
    if (!binding) throw new TaskNotFoundError(command.dispatchId);
    const [run] = await tx
      .select({
        status: agentRun.status,
        ownerId: agentRun.ownerId,
        ownerEpoch: agentRun.ownerEpoch,
        ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
      })
      .from(agentRun)
      .where(eq(agentRun.externalId, binding.runId))
      .for("update");
    const now = await getDatabaseNow(tx);
    if (
      binding.ownerId !== command.dispatchFence.ownerId ||
      binding.ownerEpoch !== command.dispatchFence.epoch ||
      binding.ownerLeaseExpiresAt === null ||
      binding.ownerLeaseExpiresAt.getTime() <= now.getTime()
    ) {
      throw new TaskRevisionConflictError(command.dispatchFence.epoch);
    }
    if (
      !run ||
      (run.status !== "running" && run.status !== "paused") ||
      run.ownerId !== command.runFence.ownerId ||
      run.ownerEpoch !== command.runFence.epoch ||
      run.ownerLeaseExpiresAt === null ||
      run.ownerLeaseExpiresAt.getTime() <= now.getTime()
    ) {
      throw new InvalidTaskProgressError(
        "Workflow run is not active for dispatch activation.",
      );
    }
    const [current] = await tx
      .select(taskFields)
      .from(task)
      .where(eq(task.id, binding.taskId))
      .for("update");
    if (!current) throw new TaskNotFoundError(binding.taskId);
    if (
      binding.status === "CANCELLING" ||
      current.status === "CANCEL_REQUESTED"
    ) {
      return {
        task: toSummary(current),
        dispatch: toDispatch(binding),
        cancelled: true,
      };
    }
    if (binding.status === "RUNNING" && current.status === "RUNNING") {
      return {
        task: toSummary(current),
        dispatch: toDispatch(binding),
        cancelled: false,
      };
    }
    if (binding.status !== "CLAIMED" || current.status !== "PENDING") {
      throw new TaskRevisionConflictError(current.revision);
    }
    const started = await transitionTask(tx, {
      taskId: binding.taskId,
      expectedRevision: current.revision,
      requestId: command.requestId,
      transition: "start",
      phase: "PREPARING",
    });
    const [running] = await tx
      .update(workflowTaskDispatch)
      .set({ status: "RUNNING", updatedAt: sql`clock_timestamp()` })
      .where(eq(workflowTaskDispatch.id, binding.id))
      .returning(dispatchFields);
    if (!running)
      throw new Error("Workflow task dispatch activation was lost.");
    return { task: started, dispatch: toDispatch(running), cancelled: false };
  });
  return { result, events: [] };
};

export const RequestWorkflowTaskDispatchCancelCommandSchema = z.strictObject({
  taskId: z.uuidv4(),
  requestId: z.uuidv4(),
});
export type RequestWorkflowTaskDispatchCancelCommand = z.infer<
  typeof RequestWorkflowTaskDispatchCancelCommandSchema
>;

/** Records user cancellation and private owner cancellation in one transaction. */
export const requestWorkflowTaskDispatchCancel: Command<
  RequestWorkflowTaskDispatchCancelCommand,
  { task: LocalizationTaskSummary; dispatch: WorkflowTaskDispatch | null }
> = async (ctx, command) => {
  const result = await ctx.db.transaction(async (tx) => {
    // Dispatch before Task is the shared order with event projection. This
    // prevents cancellation racing a terminal projection from deadlocking.
    const [binding] = await tx
      .select(dispatchFields)
      .from(workflowTaskDispatch)
      .where(eq(workflowTaskDispatch.taskId, command.taskId))
      .orderBy(sql`${workflowTaskDispatch.generation} desc`)
      .limit(1)
      .for("update");
    const [current] = await tx
      .select(taskFields)
      .from(task)
      .where(eq(task.id, command.taskId))
      .for("update");
    if (!current) throw new TaskNotFoundError(command.taskId);
    const updated =
      current.status === "CANCEL_REQUESTED"
        ? toSummary(current)
        : await transitionTask(tx, {
            taskId: command.taskId,
            expectedRevision: current.revision,
            requestId: command.requestId,
            transition: "requestCancel",
          });
    if (!binding) return { task: updated, dispatch: null };
    if (updated.state.status === "CANCELED") {
      return { task: updated, dispatch: toDispatch(binding) };
    }
    const [run] = await tx
      .select({ id: agentRun.id })
      .from(agentRun)
      .where(eq(agentRun.externalId, binding.runId));
    if (
      !run &&
      binding.status === "REQUESTED" &&
      binding.ownerId === null &&
      binding.agentSessionId === null
    ) {
      const cancelled = await transitionTask(tx, {
        taskId: command.taskId,
        expectedRevision: updated.state.revision,
        requestId: randomUUID(),
        transition: "confirmCancel",
        owner: "WORKFLOW_ADAPTER",
      });
      const [settled] = await tx
        .update(workflowTaskDispatch)
        .set({
          status: "SETTLED",
          settledAt: sql`clock_timestamp()`,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(eq(workflowTaskDispatch.id, binding.id))
        .returning(dispatchFields);
      if (!settled)
        throw new Error("Workflow task dispatch cancellation was lost.");
      return { task: cancelled, dispatch: toDispatch(settled) };
    }
    const [cancelling] = await tx
      .update(workflowTaskDispatch)
      .set({ status: "CANCELLING", updatedAt: sql`clock_timestamp()` })
      .where(eq(workflowTaskDispatch.id, binding.id))
      .returning(dispatchFields);
    return {
      task: updated,
      dispatch: cancelling ? toDispatch(cancelling) : toDispatch(binding),
    };
  });
  return { result, events: [] };
};

export const SettleWorkflowTaskDispatchCancellationCommandSchema =
  z.strictObject({
    dispatchId: z.uuidv4(),
    requestId: z.uuidv4(),
    dispatchFence: OwnershipFenceSchema,
    runFence: OwnershipFenceSchema,
    terminalSequence: z.int().positive().optional(),
  });
export type SettleWorkflowTaskDispatchCancellationCommand = z.infer<
  typeof SettleWorkflowTaskDispatchCancellationCommandSchema
>;

const settleWorkflowTaskDispatchCancellationInTransaction = async (
  tx: DbHandle,
  command: SettleWorkflowTaskDispatchCancellationCommand,
): Promise<LocalizationTaskSummary> => {
  const [binding] = await tx
    .select(dispatchFields)
    .from(workflowTaskDispatch)
    .where(eq(workflowTaskDispatch.id, command.dispatchId))
    .for("update");
  if (!binding) throw new TaskNotFoundError(command.dispatchId);
  const latestBinding = await lockLatestDispatchForTask(tx, binding.taskId);
  if (!latestBinding || latestBinding.id !== binding.id) {
    throw new TaskRevisionConflictError(binding.generation);
  }
  const [current] = await tx
    .select(taskFields)
    .from(task)
    .where(eq(task.id, binding.taskId))
    .for("update");
  if (!current) throw new TaskNotFoundError(binding.taskId);
  const [run] = await tx
    .select({
      status: agentRun.status,
      ownerId: agentRun.ownerId,
      ownerEpoch: agentRun.ownerEpoch,
    })
    .from(agentRun)
    .where(eq(agentRun.externalId, binding.runId))
    .for("update");
  if (
    binding.ownerId !== command.dispatchFence.ownerId ||
    binding.ownerEpoch !== command.dispatchFence.epoch
  ) {
    throw new TaskRevisionConflictError(command.dispatchFence.epoch);
  }
  if (
    !run ||
    run.status !== "cancelled" ||
    run.ownerId !== command.runFence.ownerId ||
    run.ownerEpoch !== command.runFence.epoch
  ) {
    throw new InvalidTaskProgressError(
      "Workflow run has not stopped publishing under the dispatch owner.",
    );
  }
  if (binding.status === "SETTLED") {
    if (current.status !== "CANCELED") {
      throw new InvalidTaskProgressError(
        "Settled workflow dispatch does not own a cancelled task.",
      );
    }
    return toSummary(current);
  }
  if (binding.status !== "CANCELLING") {
    throw new InvalidTaskProgressError("Workflow dispatch is not cancelling.");
  }
  const now = await getDatabaseNow(tx);
  if (
    binding.ownerLeaseExpiresAt === null ||
    binding.ownerLeaseExpiresAt.getTime() <= now.getTime()
  ) {
    throw new TaskRevisionConflictError(command.dispatchFence.epoch);
  }
  const cancelled = await transitionTask(tx, {
    taskId: binding.taskId,
    expectedRevision: current.revision,
    requestId: command.requestId,
    transition: "confirmCancel",
    owner: "WORKFLOW_ADAPTER",
  });
  if (
    command.terminalSequence !== undefined &&
    command.terminalSequence <= binding.lastProjectedEventSequence
  ) {
    throw new TaskRevisionConflictError(binding.lastProjectedEventSequence);
  }
  await tx
    .update(workflowTaskDispatch)
    .set({
      status: "SETTLED",
      settledAt: sql`clock_timestamp()`,
      ...(command.terminalSequence === undefined
        ? {}
        : { lastProjectedEventSequence: command.terminalSequence }),
      updatedAt: sql`clock_timestamp()`,
    })
    .where(eq(workflowTaskDispatch.id, binding.id));
  return cancelled;
};

/** Confirms cancellation from a current dispatch fence and persisted terminal run fence. */
export const settleWorkflowTaskDispatchCancellation: Command<
  SettleWorkflowTaskDispatchCancellationCommand,
  LocalizationTaskSummary
> = async (ctx, command) => {
  const parsed =
    SettleWorkflowTaskDispatchCancellationCommandSchema.parse(command);
  const result = await ctx.db.transaction(
    async (tx) =>
      await settleWorkflowTaskDispatchCancellationInTransaction(tx, parsed),
  );
  return { result, events: [] };
};

export const ProjectWorkflowTaskDispatchEventCommandSchema =
  z.discriminatedUnion("action", [
    z.strictObject({
      runId: z.uuidv4(),
      eventId: z.uuidv4(),
      sequence: z.int().positive(),
      action: z.literal("progress"),
      current: z.int().nonnegative(),
      total: z.int().positive().optional(),
      phase: z.enum(["PREPARING", "TRANSLATING", "INDEXING"]).optional(),
    }),
    z.strictObject({
      runId: z.uuidv4(),
      eventId: z.uuidv4(),
      sequence: z.int().positive(),
      action: z.literal("complete"),
      result: z.strictObject({
        translationIds: z.array(z.int()),
        translatedElementIds: z.array(z.int()),
        skippedElementIds: z.array(z.int()),
      }),
    }),
    z.strictObject({
      runId: z.uuidv4(),
      eventId: z.uuidv4(),
      sequence: z.int().positive(),
      action: z.literal("block"),
      failure: OperationFailureInputSchema,
    }),
    z.strictObject({
      runId: z.uuidv4(),
      eventId: z.uuidv4(),
      sequence: z.int().positive(),
      action: z.literal("fail"),
      failure: OperationFailureInputSchema,
    }),
    z.strictObject({
      runId: z.uuidv4(),
      eventId: z.uuidv4(),
      sequence: z.int().positive(),
      action: z.literal("requestCancel"),
    }),
    z.strictObject({
      runId: z.uuidv4(),
      eventId: z.uuidv4(),
      sequence: z.int().positive(),
      action: z.literal("confirmCancel"),
      dispatchFence: OwnershipFenceSchema,
      runFence: OwnershipFenceSchema,
    }),
  ]);
export type ProjectWorkflowTaskDispatchEventCommand = z.infer<
  typeof ProjectWorkflowTaskDispatchEventCommandSchema
>;

/** Applies an event and advances the private cursor under the same locks. */
export const projectWorkflowTaskDispatchEvent: Command<
  ProjectWorkflowTaskDispatchEventCommand,
  LocalizationTaskSummary | null
> = async (ctx, command) => {
  const result = await ctx.db.transaction(async (tx) => {
    const [binding] = await tx
      .select(dispatchFields)
      .from(workflowTaskDispatch)
      .where(eq(workflowTaskDispatch.runId, command.runId))
      .for("update");
    if (!binding || command.sequence <= binding.lastProjectedEventSequence)
      return null;
    const [latest] = await tx
      .select({ id: workflowTaskDispatch.id })
      .from(workflowTaskDispatch)
      .where(eq(workflowTaskDispatch.taskId, binding.taskId))
      .orderBy(sql`${workflowTaskDispatch.generation} desc`)
      .limit(1)
      .for("update");
    if (
      !latest ||
      latest.id !== binding.id ||
      (binding.status !== "RUNNING" && binding.status !== "CANCELLING")
    )
      return null;
    const [current] = await tx
      .select(taskFields)
      .from(task)
      .where(eq(task.id, binding.taskId))
      .for("update");
    if (!current) throw new TaskNotFoundError(binding.taskId);
    if (command.action === "confirmCancel") {
      return await settleWorkflowTaskDispatchCancellationInTransaction(tx, {
        dispatchId: binding.id,
        requestId: command.eventId,
        dispatchFence: command.dispatchFence,
        runFence: command.runFence,
        terminalSequence: command.sequence,
      });
    }
    if (
      command.action === "progress" &&
      current.status === "CANCEL_REQUESTED"
    ) {
      await tx
        .update(workflowTaskDispatch)
        .set({
          lastProjectedEventSequence: command.sequence,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(eq(workflowTaskDispatch.id, binding.id));
      return toSummary(current);
    }
    const transition =
      command.action === "progress"
        ? {
            transition: "progress" as const,
            progressCurrent: command.current,
            ...(command.total === undefined
              ? {}
              : { progressTotal: command.total }),
            ...(command.phase === undefined ? {} : { phase: command.phase }),
          }
        : command.action === "complete"
          ? { transition: "complete" as const, result: command.result }
          : command.action === "block"
            ? { transition: "block" as const, failure: command.failure }
            : command.action === "fail"
              ? { transition: "fail" as const, failure: command.failure }
              : { transition: "requestCancel" as const };
    const projected = await transitionTask(tx, {
      taskId: binding.taskId,
      expectedRevision: current.revision,
      requestId: command.eventId,
      ...transition,
    });
    await tx
      .update(workflowTaskDispatch)
      .set({
        lastProjectedEventSequence: command.sequence,
        ...(command.action === "progress" || command.action === "requestCancel"
          ? {}
          : { status: "SETTLED" as const, settledAt: sql`clock_timestamp()` }),
        updatedAt: sql`clock_timestamp()`,
      })
      .where(eq(workflowTaskDispatch.id, binding.id));
    return projected;
  });
  return { result, events: [] };
};
