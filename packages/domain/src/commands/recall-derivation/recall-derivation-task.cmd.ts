import {
  asc,
  and,
  eq,
  inArray,
  isNull,
  operationFailure,
  or,
  recallDerivationState,
  recallDerivationTaskDemand,
  task,
} from "@cat/db";
import {
  type RecallDerivationReference,
  RecallDerivationReferenceSchema,
  type TaskAffectedResource,
  TaskAffectedResourceSchema,
  TaskActorSchema,
  TaskRuntimeSchema,
  TaskScopeSchema,
} from "@cat/shared";
import * as z from "zod";

import {
  insertLocalizationTask,
  taskFields,
  toSummary,
  transitionTask,
  type LocalizationTaskSummary,
} from "#/commands/localization-task/upsert-localization-task.cmd.ts";
import { createOperationFailure } from "#/commands/operation-failure/create-operation-failure.cmd.ts";
import type { Command, DbHandle } from "#/types.ts";

const referenceKey = (reference: {
  targetKind: RecallDerivationReference["targetKind"];
  targetId: string;
  languageId: string;
}) => `${reference.targetKind}\0${reference.targetId}\0${reference.languageId}`;

export const CreateRecallDerivationTaskCommandSchema = z.strictObject({
  references: z.array(RecallDerivationReferenceSchema).min(1),
  scope: TaskScopeSchema,
  actor: TaskActorSchema,
  resources: z
    .array(TaskAffectedResourceSchema)
    .min(1)
    .superRefine((resources, ctx) => {
      for (const [index, resource] of resources.entries()) {
        if (
          resource.type !== "PROJECT" &&
          resource.type !== "MEMORY" &&
          resource.type !== "GLOSSARY"
        ) {
          ctx.addIssue({
            code: "custom",
            message:
              "Recall derivation Tasks may affect only projects, memories, and glossaries.",
            path: [index, "type"],
          });
        }
      }
    }),
});

export const ProjectRecallDerivationTasksCommandSchema = z.strictObject({
  taskIds: z.array(z.uuidv4()).min(1),
});

export const RequestRecallDerivationTaskCancelCommandSchema = z.strictObject({
  taskId: z.uuidv4(),
  expectedRevision: z.int().nonnegative(),
  requestId: z.uuidv4(),
});

export type CreateRecallDerivationTaskCommand = z.infer<
  typeof CreateRecallDerivationTaskCommandSchema
>;

const statusFor = (
  observations: Array<{
    state: typeof recallDerivationState.$inferSelect | null;
    demandRevision: number;
    observedProjectionRevision: number;
    detachedAt: Date | null;
    supersededAt: Date | null;
  }>,
) => {
  const active = observations.filter((entry) => entry.detachedAt === null);
  const superseded = active.filter(
    (entry) =>
      entry.supersededAt !== null ||
      entry.state === null ||
      entry.state.demandRevision !== entry.demandRevision,
  );
  const current = active.filter(
    (entry) =>
      entry.supersededAt === null &&
      entry.state !== null &&
      entry.state.demandRevision === entry.demandRevision,
  );
  const fresh = current.filter(
    (entry) => entry.state?.status === "FRESH",
  ).length;
  const failures = current
    .filter((entry) => entry.state?.status === "FAILED")
    .sort((left, right) => left.state!.id - right.state!.id);
  const failed = failures.length;
  const blocked = current.filter((entry) => entry.state?.status === "BLOCKED");
  const running = current.some((entry) => entry.state?.status === "RUNNING");
  if (active.length === 0)
    return {
      status: "CANCELED" as const,
      fresh,
      failed,
      superseded: 0,
      phase: "QUEUED" as const,
      blocker: null,
    };
  if (fresh + superseded.length === active.length)
    return {
      status: "COMPLETED" as const,
      fresh,
      failed,
      superseded: superseded.length,
      phase: "PUBLISHING" as const,
      blocker: null,
    };
  if (failed > 0)
    return {
      status: "FAILED" as const,
      fresh,
      failed,
      superseded: superseded.length,
      phase: "DERIVING" as const,
      blocker: failures[0]?.state?.blocker ?? null,
    };
  if (blocked.length > 0)
    return {
      status: "BLOCKED" as const,
      fresh,
      failed,
      superseded: superseded.length,
      phase: "DERIVING" as const,
      blocker: blocked[0]?.state?.blocker ?? null,
    };
  return {
    status: running ? ("RUNNING" as const) : ("PENDING" as const),
    fresh,
    failed,
    superseded: superseded.length,
    phase: running ? ("DERIVING" as const) : ("QUEUED" as const),
    blocker: null,
  };
};

const failureFor = (input: {
  status: "BLOCKED" | "FAILED";
  resources: TaskAffectedResource[];
  blocker?: { reason: string; retryable: boolean; message: string } | null;
}) => ({
  code:
    input.status === "BLOCKED"
      ? ("CAT_OPERATION_DEPENDENCY_UNAVAILABLE" as const)
      : ("CAT_OPERATION_FAILED" as const),
  message:
    input.blocker?.message ??
    (input.status === "BLOCKED"
      ? "Recall derivation is blocked by a shared dependency."
      : "Recall derivation failed."),
  severity: "ERROR" as const,
  retryable: input.blocker?.retryable ?? false,
  blocker:
    input.status === "BLOCKED"
      ? ("recall_derivation_blocked" as const)
      : ("recall_derivation_failed" as const),
  capability: "RECALL_DERIVATION" as const,
  affectedResources: input.resources,
  redactionBoundary: "INTERNAL" as const,
});

const sameFailure = (
  persisted: {
    code: string;
    message: string;
    severity: string;
    retryable: boolean;
    blocker: string | null;
    capability: string | null;
    affectedResources: TaskAffectedResource[];
    redactionBoundary: string;
  },
  expected: ReturnType<typeof failureFor>,
): boolean =>
  persisted.code === expected.code &&
  persisted.message === expected.message &&
  persisted.severity === expected.severity &&
  persisted.retryable === expected.retryable &&
  persisted.blocker === expected.blocker &&
  persisted.capability === expected.capability &&
  persisted.redactionBoundary === expected.redactionBoundary &&
  JSON.stringify(persisted.affectedResources) ===
    JSON.stringify(expected.affectedResources);

const confirmRecallDerivationTaskCancel = async (
  db: DbHandle,
  input: { taskId: string; expectedRevision: number; requestId: string },
): Promise<LocalizationTaskSummary> => {
  await db
    .update(recallDerivationTaskDemand)
    .set({ detachedAt: new Date() })
    .where(
      and(
        eq(recallDerivationTaskDemand.taskId, input.taskId),
        isNull(recallDerivationTaskDemand.detachedAt),
      ),
    );
  return await transitionTask(db, {
    taskId: input.taskId,
    expectedRevision: input.expectedRevision,
    requestId: input.requestId,
    transition: "confirmCancel",
    owner: "RECALL_DERIVATION_ADAPTER",
  });
};

const projectTask = async (
  db: DbHandle,
  taskId: string,
): Promise<LocalizationTaskSummary | null> => {
  const [current] = await db
    .select(taskFields)
    .from(task)
    .where(eq(task.id, taskId))
    .for("update");
  if (!current || current.kind !== "RECALL_DERIVATION") return null;
  const demands = await db
    .select()
    .from(recallDerivationTaskDemand)
    .where(eq(recallDerivationTaskDemand.taskId, taskId))
    .orderBy(asc(recallDerivationTaskDemand.id));
  const stateIds = demands
    .flatMap((demand) =>
      demand.derivationStateId === null ? [] : [demand.derivationStateId],
    )
    .sort((left, right) => left - right);
  const lockedStates =
    stateIds.length === 0
      ? []
      : await db
          .select()
          .from(recallDerivationState)
          .where(inArray(recallDerivationState.id, stateIds))
          .orderBy(asc(recallDerivationState.id))
          .for("update");
  const statesById = new Map(lockedStates.map((state) => [state.id, state]));
  const observations = demands.map((demand) => ({
    state:
      demand.derivationStateId === null
        ? null
        : (statesById.get(demand.derivationStateId) ?? null),
    demandRevision: demand.demandRevision,
    observedProjectionRevision: demand.observedProjectionRevision,
    detachedAt: demand.detachedAt,
    supersededAt: demand.supersededAt,
  }));
  if (observations.length === 0) return toSummary(current);

  const supersededDemandIds = demands.flatMap((demand) => {
    const state =
      demand.derivationStateId === null
        ? null
        : (statesById.get(demand.derivationStateId) ?? null);
    return demand.detachedAt === null &&
      demand.supersededAt === null &&
      (state === null || state.demandRevision !== demand.demandRevision)
      ? [demand.id]
      : [];
  });
  if (supersededDemandIds.length > 0) {
    await db
      .update(recallDerivationTaskDemand)
      .set({ supersededAt: new Date() })
      .where(
        and(
          inArray(recallDerivationTaskDemand.id, supersededDemandIds),
          isNull(recallDerivationTaskDemand.supersededAt),
        ),
      );
  }

  const aggregate = statusFor(observations);
  const terminal =
    current.status === "COMPLETED" ||
    current.status === "FAILED" ||
    current.status === "CANCELED";
  if (terminal) return toSummary(current);
  const status = aggregate.status;
  const runtime = TaskRuntimeSchema.parse({
    kind: "RECALL_DERIVATION",
    phase: status === "CANCELED" ? current.runtime.phase : aggregate.phase,
    result:
      status === "COMPLETED" || status === "FAILED"
        ? {
            fresh: aggregate.fresh,
            failed: aggregate.failed,
            superseded: aggregate.superseded,
            total: observations.length,
          }
        : null,
  });
  const needsFailure = status === "BLOCKED" || status === "FAILED";
  const expectedFailure = needsFailure
    ? failureFor({
        status,
        resources: current.resources,
        blocker: aggregate.blocker,
      })
    : null;
  const [persistedFailure] = current.currentFailureId
    ? await db
        .select({
          code: operationFailure.code,
          message: operationFailure.message,
          severity: operationFailure.severity,
          retryable: operationFailure.retryable,
          blocker: operationFailure.blocker,
          capability: operationFailure.capability,
          affectedResources: operationFailure.affectedResources,
          redactionBoundary: operationFailure.redactionBoundary,
        })
        .from(operationFailure)
        .where(eq(operationFailure.id, current.currentFailureId))
    : [];
  const currentFailureId =
    expectedFailure &&
    current.status === status &&
    persistedFailure &&
    sameFailure(persistedFailure, expectedFailure)
      ? current.currentFailureId
      : expectedFailure
        ? (
            await createOperationFailure(
              { db },
              {
                failure: expectedFailure,
                taskId,
              },
            )
          ).result.id
        : null;
  const now = new Date();
  const hasSameProjection =
    current.status === status &&
    current.progressCurrent === aggregate.fresh + aggregate.superseded &&
    current.progressTotal === observations.length &&
    JSON.stringify(current.runtime) === JSON.stringify(runtime) &&
    current.currentFailureId === currentFailureId;
  const hasUnobservedState = observations.some(
    (observation) =>
      observation.state !== null &&
      observation.state.taskProjectionRevision !==
        observation.observedProjectionRevision,
  );
  const observeStateRevisions = async () => {
    for (const demand of demands) {
      if (demand.derivationStateId === null) continue;
      const state = statesById.get(demand.derivationStateId);
      if (
        !state ||
        state.taskProjectionRevision === demand.observedProjectionRevision
      )
        continue;
      await db
        .update(recallDerivationTaskDemand)
        .set({ observedProjectionRevision: state.taskProjectionRevision })
        .where(eq(recallDerivationTaskDemand.id, demand.id));
    }
  };
  if (hasSameProjection) {
    if (hasUnobservedState) await observeStateRevisions();
    return toSummary(current);
  }
  const [updated] = await db
    .update(task)
    .set({
      status,
      revision: current.revision + 1,
      progressCurrent: aggregate.fresh + aggregate.superseded,
      progressTotal: observations.length,
      runtime,
      currentFailureId,
      startedAt:
        status === "PENDING" ? current.startedAt : (current.startedAt ?? now),
      finishedAt:
        status === "COMPLETED" || status === "FAILED" || status === "CANCELED"
          ? now
          : null,
      updatedAt: now,
    })
    .where(and(eq(task.id, taskId), eq(task.revision, current.revision)))
    .returning(taskFields);
  if (updated) await observeStateRevisions();
  return updated ? toSummary(updated) : null;
};

export const createRecallDerivationTask: Command<
  CreateRecallDerivationTaskCommand,
  LocalizationTaskSummary
> = async (ctx, input) => {
  const command = CreateRecallDerivationTaskCommandSchema.parse(input);
  const result = await ctx.db.transaction(async (tx) => {
    const references = [
      ...new Map(
        command.references.map((reference) => [
          referenceKey(reference),
          reference,
        ]),
      ).values(),
    ];
    const referenceRevisions = new Map<string, number>();
    for (const reference of command.references) {
      const key = referenceKey(reference);
      const previous = referenceRevisions.get(key);
      if (previous !== undefined && previous !== reference.demandRevision) {
        throw new TypeError(
          "Recall derivation task references cannot mix demand revisions for one target.",
        );
      }
      referenceRevisions.set(key, reference.demandRevision);
    }
    const states = await tx
      .select({
        id: recallDerivationState.id,
        targetKind: recallDerivationState.targetKind,
        targetId: recallDerivationState.targetId,
        languageId: recallDerivationState.languageId,
        demandRevision: recallDerivationState.demandRevision,
        taskProjectionRevision: recallDerivationState.taskProjectionRevision,
      })
      .from(recallDerivationState)
      .where(
        or(
          ...references.map((reference) =>
            and(
              eq(recallDerivationState.targetKind, reference.targetKind),
              eq(recallDerivationState.targetId, reference.targetId),
              eq(recallDerivationState.languageId, reference.languageId),
            ),
          ),
        ),
      )
      .orderBy(asc(recallDerivationState.id))
      .for("update");
    const matched = references.map((reference) =>
      states.find(
        (state) =>
          referenceKey(reference) === referenceKey(state) &&
          reference.demandRevision === state.demandRevision,
      ),
    );
    if (matched.some((state) => state === undefined)) {
      throw new TypeError(
        "Recall derivation task references must resolve to persisted demands.",
      );
    }
    const created = await insertLocalizationTask(tx, {
      task: {
        kind: "RECALL_DERIVATION",
        payload: { references, cancelable: true },
      },
      scope: command.scope,
      actor: command.actor,
      resources: command.resources,
    });
    await tx.insert(recallDerivationTaskDemand).values(
      matched.map((state) => ({
        taskId: created.id,
        derivationStateId: state!.id,
        targetKind: state!.targetKind,
        targetId: state!.targetId,
        languageId: state!.languageId,
        demandRevision: state!.demandRevision,
        observedProjectionRevision: state!.taskProjectionRevision,
      })),
    );
    return await projectTask(tx, created.id);
  });
  if (!result) throw new Error("Recall derivation task was not created.");
  return { result, events: [] };
};

export const projectRecallDerivationTasks: Command<
  z.infer<typeof ProjectRecallDerivationTasksCommandSchema>,
  LocalizationTaskSummary[]
> = async (ctx, input) => {
  const command = ProjectRecallDerivationTasksCommandSchema.parse(input);
  const taskIds = [...new Set(command.taskIds)].sort();
  const result = await ctx.db.transaction(async (tx) => {
    const summaries: LocalizationTaskSummary[] = [];
    for (const taskId of taskIds) {
      const summary = await projectTask(tx, taskId);
      if (summary) summaries.push(summary);
    }
    return summaries;
  });
  return { result, events: [] };
};

/** Detaches this Task from shared work; it never cancels the coalesced demand. */
export const requestRecallDerivationTaskCancel: Command<
  z.infer<typeof RequestRecallDerivationTaskCancelCommandSchema>,
  LocalizationTaskSummary
> = async (ctx, input) => {
  const command = RequestRecallDerivationTaskCancelCommandSchema.parse(input);
  const result = await ctx.db.transaction(async (tx) => {
    const requested = await transitionTask(tx, {
      taskId: command.taskId,
      expectedRevision: command.expectedRevision,
      requestId: command.requestId,
      transition: "requestCancel",
    });
    if (requested.state.status === "CANCELED") return requested;
    return await confirmRecallDerivationTaskCancel(tx, {
      taskId: command.taskId,
      expectedRevision: requested.state.revision,
      requestId: crypto.randomUUID(),
    });
  });
  return { result, events: [] };
};
